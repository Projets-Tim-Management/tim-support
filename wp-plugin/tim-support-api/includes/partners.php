<?php
/**
 * Espace partenaires — programme de points & récompenses.
 *
 * Concept :
 *   - Les partenaires sont des utilisateurs de l'app (app.tim-management.co).
 *     Ils n'ont PAS de compte WordPress. Ils sont identifiés par leur email
 *     (clé de rapprochement du MVP) et, quand disponible, par leur user_id app.
 *   - Les points sont stockés dans un LEDGER (table custom) : 1 ligne = 1
 *     transaction (delta + motif + source). Le solde = somme des deltas.
 *     C'est auditable, réversible, et anti-fraude.
 *   - Sources de points (MVP, attribution 100 % manuelle par un admin) :
 *       • contrat    — contrat/contact apporté
 *       • avis       — avis posté sur un site partenaire (vérifié manuellement)
 *       • ajustement — correction manuelle (peut être négatif)
 *       • echange    — débit automatique lors d'un échange contre une récompense
 *   - Le catalogue de lots est un CPT `reward` (coût en points, stock).
 *   - Un échange crée une commande `reward_order` à traiter, débite le ledger
 *     et notifie admin + partenaire.
 *
 * Sécurité des routes REST :
 *   Toutes les routes partenaires sont protégées par un secret partagé
 *   serveur-à-serveur. Le front Next.js (qui détient la session JWT du
 *   partenaire) appelle WP avec l'en-tête `X-Tim-Internal-Secret`. WP ne fait
 *   jamais confiance à un user_email reçu sans ce secret.
 *
 *   À définir dans wp-config.php :
 *     define( 'TIM_INTERNAL_SECRET', '<même valeur que côté Next/Vercel>' );
 *   Notifications admin : réutilise TIM_TICKETS_NOTIFY_EMAIL si défini.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// Sources de transaction autorisées en écriture manuelle (admin / API grant).
const TIM_POINTS_SOURCES = [ 'contrat', 'avis', 'ajustement' ];

const TIM_POINTS_SOURCE_LABELS = [
    'contrat'    => '📄 Contrat / contact apporté',
    'avis'       => '⭐ Avis partenaire (SEO)',
    'ajustement' => '⚖️ Ajustement manuel',
    'echange'    => '🎁 Échange récompense',
];

// Cycle de vie d'une commande d'échange.
const TIM_ORDER_STATUSES = [ 'pending', 'approved', 'shipped', 'delivered', 'cancelled' ];

const TIM_ORDER_STATUS_LABELS = [
    'pending'   => '🕓 À traiter',
    'approved'  => '✅ Validée',
    'shipped'   => '📦 Expédiée',
    'delivered' => '🎉 Remise',
    'cancelled' => '❌ Annulée (remboursée)',
];

const TIM_ORDER_STATUS_COLORS = [
    'pending'   => '#ca8a04',
    'approved'  => '#2563eb',
    'shipped'   => '#7c3aed',
    'delivered' => '#16a34a',
    'cancelled' => '#6b7280',
];

const TIM_POINTS_DB_VERSION = '1.0.0';

// ─── Table du ledger ──────────────────────────────────────────────────────────

function _tim_points_table(): string {
    global $wpdb;
    return $wpdb->prefix . 'tim_points_ledger';
}

/**
 * Crée / met à jour la table du ledger. Idempotent (dbDelta).
 * Déclenché à l'init si la version stockée diffère, pour couvrir le cas où le
 * plugin est mis à jour par simple remplacement de fichiers (sans réactivation).
 */
function _tim_points_maybe_install_table(): void {
    if ( get_option( 'tim_points_db_version' ) === TIM_POINTS_DB_VERSION ) return;

    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $table   = _tim_points_table();
    $charset = $wpdb->get_charset_collate();

    $sql = "CREATE TABLE $table (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_email VARCHAR(190) NOT NULL,
        user_id VARCHAR(190) NULL,
        delta INT NOT NULL,
        motif VARCHAR(255) NOT NULL DEFAULT '',
        source VARCHAR(32) NOT NULL DEFAULT 'ajustement',
        ref VARCHAR(190) NULL,
        created_at DATETIME NOT NULL,
        created_by BIGINT UNSIGNED NULL,
        PRIMARY KEY  (id),
        KEY user_email (user_email),
        KEY source (source)
    ) $charset;";

    dbDelta( $sql );
    update_option( 'tim_points_db_version', TIM_POINTS_DB_VERSION );
}
add_action( 'init', '_tim_points_maybe_install_table' );

// ─── Helpers points ───────────────────────────────────────────────────────────

function _tim_normalize_email( string $email ): string {
    return strtolower( trim( $email ) );
}

/** Solde courant d'un partenaire (somme des deltas). */
function _tim_points_balance( string $email ): int {
    global $wpdb;
    $email = _tim_normalize_email( $email );
    if ( $email === '' ) return 0;
    $table = _tim_points_table();
    $sum = $wpdb->get_var( $wpdb->prepare(
        "SELECT COALESCE(SUM(delta),0) FROM $table WHERE user_email = %s",
        $email
    ) );
    return (int) $sum;
}

/**
 * Insère une transaction de points. Retourne l'id de la ligne, ou 0 en échec.
 * Ne fait AUCUN contrôle de solde (le débit d'échange le fait en amont).
 */
function _tim_points_add( string $email, int $delta, string $motif, string $source, ?string $ref = null, ?int $created_by = null ): int {
    global $wpdb;
    $email = _tim_normalize_email( $email );
    if ( $email === '' || $delta === 0 ) return 0;

    $ok = $wpdb->insert( _tim_points_table(), [
        'user_email' => $email,
        'user_id'    => null,
        'delta'      => $delta,
        'motif'      => mb_substr( $motif, 0, 255 ),
        'source'     => in_array( $source, array_keys( TIM_POINTS_SOURCE_LABELS ), true ) ? $source : 'ajustement',
        'ref'        => $ref,
        'created_at' => current_time( 'mysql' ),
        'created_by' => $created_by,
    ], [ '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%d' ] );

    return $ok ? (int) $wpdb->insert_id : 0;
}

/** Historique des transactions d'un partenaire (plus récent d'abord). */
function _tim_points_history( string $email, int $limit = 100 ): array {
    global $wpdb;
    $email = _tim_normalize_email( $email );
    if ( $email === '' ) return [];
    $table = _tim_points_table();
    $rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT delta, motif, source, ref, created_at FROM $table
         WHERE user_email = %s ORDER BY id DESC LIMIT %d",
        $email, $limit
    ), ARRAY_A );

    return array_map( fn( $r ) => [
        'delta'      => (int) $r['delta'],
        'motif'      => $r['motif'],
        'source'     => $r['source'],
        'ref'        => $r['ref'],
        'created_at' => mysql2date( 'c', $r['created_at'], false ),
    ], $rows ?: [] );
}

// ─── CPT : catalogue de récompenses ───────────────────────────────────────────

add_action( 'init', function () {
    register_post_type( 'reward', [
        'labels' => [
            'name'          => 'Récompenses',
            'singular_name' => 'Récompense',
            'menu_name'     => 'Récompenses',
            'add_new'       => 'Ajouter',
            'add_new_item'  => 'Ajouter une récompense',
            'edit_item'     => 'Modifier la récompense',
            'all_items'     => 'Toutes les récompenses',
            'not_found'     => 'Aucune récompense.',
        ],
        'public'          => false,
        'show_ui'         => true,
        'show_in_menu'    => false,  // entrées de menu déclarées explicitement (voir admin_menu)  // sous le menu Partenaires
        'menu_icon'       => 'dashicons-awards',
        'supports'        => [ 'title', 'editor', 'thumbnail' ],
        'show_in_rest'    => false,
        'capability_type' => 'post',
        'has_archive'     => false,
        'rewrite'         => false,
    ] );

    register_post_type( 'reward_order', [
        'labels' => [
            'name'          => 'Commandes',
            'singular_name' => 'Commande',
            'menu_name'     => 'Commandes',
            'all_items'     => 'Toutes les commandes',
            'edit_item'     => 'Détail de la commande',
            'not_found'     => 'Aucune commande.',
        ],
        'public'          => false,
        'show_ui'         => true,
        'show_in_menu'    => false,  // entrées de menu déclarées explicitement (voir admin_menu)
        'menu_icon'       => 'dashicons-cart',
        'supports'        => [ 'title' ],
        'show_in_rest'    => false,
        'capability_type' => 'post',
        'has_archive'     => false,
        'rewrite'         => false,
    ] );
} );

// ─── CPT reward : méta-box coût / stock ───────────────────────────────────────

add_action( 'add_meta_boxes', function () {
    add_meta_box( 'tim_reward_meta', '🎁 Paramètres de la récompense', '_tim_reward_render_meta_box', 'reward', 'side', 'high' );
} );

function _tim_reward_render_meta_box( WP_Post $post ): void {
    wp_nonce_field( 'tim_reward_meta', 'tim_reward_nonce' );
    $cost  = (int) get_post_meta( $post->ID, '_reward_cost', true );
    $stock = get_post_meta( $post->ID, '_reward_stock', true );
    $stock = ( $stock === '' ) ? -1 : (int) $stock;
    ?>
    <p>
        <label for="tim_reward_cost"><strong>Coût en points</strong></label><br>
        <input type="number" min="0" step="1" id="tim_reward_cost" name="tim_reward_cost"
               value="<?php echo esc_attr( (string) $cost ); ?>" style="width:100%;">
    </p>
    <p>
        <label for="tim_reward_stock"><strong>Stock</strong></label><br>
        <input type="number" step="1" id="tim_reward_stock" name="tim_reward_stock"
               value="<?php echo esc_attr( (string) $stock ); ?>" style="width:100%;">
        <span class="description">−1 = illimité. 0 = épuisé (masqué du catalogue).</span>
    </p>
    <p class="description">L'image mise en avant sert de visuel. Le contenu de l'éditeur sert de description.</p>
    <?php
}

add_action( 'save_post_reward', function ( $post_id ) {
    if ( ! isset( $_POST['tim_reward_nonce'] ) ) return;
    if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['tim_reward_nonce'] ) ), 'tim_reward_meta' ) ) return;
    if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) return;
    if ( ! current_user_can( 'edit_post', $post_id ) ) return;

    if ( isset( $_POST['tim_reward_cost'] ) ) {
        update_post_meta( $post_id, '_reward_cost', max( 0, (int) $_POST['tim_reward_cost'] ) );
    }
    if ( isset( $_POST['tim_reward_stock'] ) ) {
        update_post_meta( $post_id, '_reward_stock', (int) $_POST['tim_reward_stock'] );
    }
}, 10 );

// Colonnes admin du catalogue.
add_filter( 'manage_reward_posts_columns', function ( $cols ) {
    $new = [ 'cb' => $cols['cb'] ?? '', 'title' => 'Récompense', 'reward_cost' => 'Coût', 'reward_stock' => 'Stock', 'date' => 'Créée le' ];
    return $new;
} );
add_action( 'manage_reward_posts_custom_column', function ( $col, $post_id ) {
    if ( $col === 'reward_cost' ) {
        echo '<strong>' . esc_html( number_format_i18n( (int) get_post_meta( $post_id, '_reward_cost', true ) ) ) . '</strong> pts';
    } elseif ( $col === 'reward_stock' ) {
        $s = get_post_meta( $post_id, '_reward_stock', true );
        $s = ( $s === '' ) ? -1 : (int) $s;
        echo $s < 0 ? '∞' : ( $s === 0 ? '<span style="color:#dc2626;">épuisé</span>' : esc_html( (string) $s ) );
    }
}, 10, 2 );

// ─── Formatage REST d'une récompense ──────────────────────────────────────────

function _tim_format_reward( WP_Post $post ): array {
    $thumb_id = get_post_thumbnail_id( $post->ID );
    $stock    = get_post_meta( $post->ID, '_reward_stock', true );
    return [
        'id'        => $post->ID,
        'slug'      => $post->post_name,
        'title'     => $post->post_title,
        'description' => wp_strip_all_tags( $post->post_content ),
        'cost'      => (int) get_post_meta( $post->ID, '_reward_cost', true ),
        'stock'     => ( $stock === '' ) ? -1 : (int) $stock,
        'image'     => $thumb_id ? wp_get_attachment_image_url( $thumb_id, 'large' ) : null,
    ];
}

// ─── Commandes d'échange : numéro + helpers ───────────────────────────────────

function _tim_generate_order_number(): int {
    global $wpdb;
    for ( $i = 0; $i < 20; $i++ ) {
        $num = wp_rand( 1000, 99999 );
        $exists = $wpdb->get_var( $wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_order_number' AND meta_value = %s LIMIT 1",
            $num
        ) );
        if ( ! $exists ) return $num;
    }
    return wp_rand( 100000, 999999 );
}

function _tim_order_notify( int $order_id, int $reward_id, string $email, int $cost, int $number ): void {
    $reward_title = get_the_title( $reward_id );

    // Admin
    $to = defined( 'TIM_TICKETS_NOTIFY_EMAIL' ) ? TIM_TICKETS_NOTIFY_EMAIL : get_option( 'admin_email' );
    $admin_link = admin_url( 'post.php?action=edit&post=' . $order_id );
    $body  = "Nouvel échange de points sur l'espace partenaires.\n\n";
    $body .= "Récompense : $reward_title\n";
    $body .= "Partenaire : $email\n";
    $body .= "Coût       : $cost points\n";
    $body .= "\nTraiter la commande : $admin_link\n";
    wp_mail( $to, "[Échange #$number] $reward_title", $body );

    // Partenaire
    if ( is_email( $email ) ) {
        $msg  = "Bonjour,\n\n";
        $msg .= "Votre demande d'échange a bien été enregistrée.\n\n";
        $msg .= "Récompense : $reward_title\n";
        $msg .= "Coût       : $cost points\n";
        $msg .= "Référence  : #$number\n\n";
        $msg .= "Notre équipe la traite et revient vers vous rapidement.\n\n";
        $msg .= "L'équipe TIM Management";
        wp_mail( $email, "[TIM Management] Échange enregistré : $reward_title", $msg );
    }
}

// ─── Sécurité REST : secret interne ───────────────────────────────────────────

function _tim_check_internal_secret( WP_REST_Request $req ): bool {
    if ( ! defined( 'TIM_INTERNAL_SECRET' ) || ! TIM_INTERNAL_SECRET ) return false;
    $sent = $req->get_header( 'x_tim_internal_secret' );
    return is_string( $sent ) && hash_equals( (string) TIM_INTERNAL_SECRET, $sent );
}

// ─── Routes REST ──────────────────────────────────────────────────────────────

add_action( 'rest_api_init', function () {

    // Solde + historique d'un partenaire.
    register_rest_route( 'tim-support/v1', '/points', [
        'methods'             => 'GET',
        'permission_callback' => '_tim_check_internal_secret',
        'args'                => [ 'email' => [ 'required' => true, 'type' => 'string' ] ],
        'callback'            => function ( WP_REST_Request $req ) {
            $email = _tim_normalize_email( (string) $req->get_param( 'email' ) );
            if ( ! is_email( $email ) ) {
                return new WP_Error( 'invalid_email', 'Email invalide.', [ 'status' => 400 ] );
            }
            return rest_ensure_response( [
                'email'   => $email,
                'balance' => _tim_points_balance( $email ),
                'history' => _tim_points_history( $email ),
                'code'    => function_exists( '_tim_partner_code' ) ? _tim_partner_code( $email ) : '',
            ] );
        },
    ] );

    // Attribution manuelle de points (utilisée par d'éventuels appels app/script).
    register_rest_route( 'tim-support/v1', '/points/grant', [
        'methods'             => 'POST',
        'permission_callback' => '_tim_check_internal_secret',
        'args'                => [
            'email'  => [ 'required' => true, 'type' => 'string' ],
            'points' => [ 'required' => true, 'type' => 'integer' ],
            'motif'  => [ 'required' => false, 'type' => 'string' ],
            'source' => [ 'required' => false, 'type' => 'string' ],
        ],
        'callback'            => function ( WP_REST_Request $req ) {
            $email  = _tim_normalize_email( (string) $req->get_param( 'email' ) );
            $points = (int) $req->get_param( 'points' );
            $motif  = sanitize_text_field( (string) ( $req->get_param( 'motif' ) ?? '' ) );
            $source = sanitize_text_field( (string) ( $req->get_param( 'source' ) ?? 'ajustement' ) );

            if ( ! is_email( $email ) ) {
                return new WP_Error( 'invalid_email', 'Email invalide.', [ 'status' => 400 ] );
            }
            if ( $points === 0 ) {
                return new WP_Error( 'invalid_points', 'Le nombre de points ne peut pas être nul.', [ 'status' => 400 ] );
            }
            if ( ! in_array( $source, TIM_POINTS_SOURCES, true ) ) $source = 'ajustement';

            $id = _tim_points_add( $email, $points, $motif, $source );
            if ( ! $id ) {
                return new WP_Error( 'save_failed', 'Échec de l\'enregistrement.', [ 'status' => 500 ] );
            }
            return rest_ensure_response( [ 'success' => true, 'balance' => _tim_points_balance( $email ) ] );
        },
    ] );

    // Catalogue de récompenses (lots disponibles, stock > 0 ou illimité).
    register_rest_route( 'tim-support/v1', '/rewards', [
        'methods'             => 'GET',
        'permission_callback' => '_tim_check_internal_secret',
        'callback'            => function () {
            $posts = get_posts( [
                'post_type'      => 'reward',
                'post_status'    => 'publish',
                'posts_per_page' => 200,
                'orderby'        => 'meta_value_num',
                'meta_key'       => '_reward_cost',
                'order'          => 'ASC',
            ] );
            $out = [];
            foreach ( $posts as $p ) {
                $r = _tim_format_reward( $p );
                if ( $r['stock'] === 0 ) continue; // épuisé → masqué
                $out[] = $r;
            }
            return rest_ensure_response( $out );
        },
    ] );

    // Échange : débit atomique + création de commande.
    register_rest_route( 'tim-support/v1', '/rewards/redeem', [
        'methods'             => 'POST',
        'permission_callback' => '_tim_check_internal_secret',
        'args'                => [
            'email'     => [ 'required' => true, 'type' => 'string' ],
            'reward_id' => [ 'required' => true, 'type' => 'integer' ],
        ],
        'callback'            => '_tim_rest_redeem',
    ] );

} );

function _tim_rest_redeem( WP_REST_Request $req ) {
    $email     = _tim_normalize_email( (string) $req->get_param( 'email' ) );
    $reward_id = absint( $req->get_param( 'reward_id' ) );

    if ( ! is_email( $email ) ) {
        return new WP_Error( 'invalid_email', 'Email invalide.', [ 'status' => 400 ] );
    }

    $reward = get_post( $reward_id );
    if ( ! $reward || $reward->post_type !== 'reward' || $reward->post_status !== 'publish' ) {
        return new WP_Error( 'reward_not_found', 'Récompense introuvable.', [ 'status' => 404 ] );
    }

    // Verrou court anti double-clic / double-soumission (par partenaire).
    $lock = 'tim_redeem_lock_' . md5( $email );
    if ( get_transient( $lock ) ) {
        return new WP_Error( 'busy', 'Une demande est déjà en cours, patientez quelques secondes.', [ 'status' => 429 ] );
    }
    set_transient( $lock, 1, 10 );

    $cost  = (int) get_post_meta( $reward_id, '_reward_cost', true );
    $stock = get_post_meta( $reward_id, '_reward_stock', true );
    $stock = ( $stock === '' ) ? -1 : (int) $stock;

    if ( $stock === 0 ) {
        delete_transient( $lock );
        return new WP_Error( 'out_of_stock', 'Cette récompense est épuisée.', [ 'status' => 409 ] );
    }

    $balance = _tim_points_balance( $email );
    if ( $balance < $cost ) {
        delete_transient( $lock );
        return new WP_Error( 'insufficient_points', 'Solde de points insuffisant.', [
            'status' => 400, 'balance' => $balance, 'cost' => $cost,
        ] );
    }

    // Débit du ledger.
    $ledger_id = _tim_points_add( $email, -$cost, 'Échange : ' . $reward->post_title, 'echange' );
    if ( ! $ledger_id ) {
        delete_transient( $lock );
        return new WP_Error( 'save_failed', 'Échec du débit des points.', [ 'status' => 500 ] );
    }

    // Création de la commande.
    $number   = _tim_generate_order_number();
    $order_id = wp_insert_post( [
        'post_type'   => 'reward_order',
        'post_title'  => sprintf( '#%d — %s — %s', $number, $reward->post_title, $email ),
        'post_status' => 'publish',
    ], true );

    if ( is_wp_error( $order_id ) ) {
        // Rollback du débit pour ne pas léser le partenaire.
        _tim_points_add( $email, $cost, 'Annulation échange (échec création commande)', 'ajustement', (string) $ledger_id );
        delete_transient( $lock );
        return new WP_Error( 'save_failed', 'Échec de la création de la commande.', [ 'status' => 500 ] );
    }

    update_post_meta( $order_id, '_order_number',     $number );
    update_post_meta( $order_id, '_order_user_email', $email );
    update_post_meta( $order_id, '_order_reward_id',  $reward_id );
    update_post_meta( $order_id, '_order_cost',       $cost );
    update_post_meta( $order_id, '_order_status',     'pending' );
    update_post_meta( $order_id, '_order_ledger_id',  $ledger_id );

    // Rattache la transaction de débit à la commande (traçabilité).
    global $wpdb;
    $wpdb->update( _tim_points_table(), [ 'ref' => 'order:' . $order_id ], [ 'id' => $ledger_id ], [ '%s' ], [ '%d' ] );

    // Décrément du stock si fini.
    if ( $stock > 0 ) {
        update_post_meta( $reward_id, '_reward_stock', $stock - 1 );
    }

    _tim_order_notify( $order_id, $reward_id, $email, $cost, $number );
    delete_transient( $lock );

    return rest_ensure_response( [
        'success'      => true,
        'order_number' => $number,
        'balance'      => _tim_points_balance( $email ),
    ] );
}

// ─── Admin : commandes (statut + remboursement sur annulation) ────────────────

add_filter( 'manage_reward_order_posts_columns', function () {
    return [
        'cb'           => '<input type="checkbox" />',
        'order_number' => 'N°',
        'title'        => 'Commande',
        'order_status' => 'Statut',
        'order_cost'   => 'Coût',
        'date'         => 'Reçue le',
    ];
} );

add_action( 'manage_reward_order_posts_custom_column', function ( $col, $post_id ) {
    switch ( $col ) {
        case 'order_number':
            echo '<strong style="font-family:monospace;">#' . esc_html( (string) get_post_meta( $post_id, '_order_number', true ) ) . '</strong>';
            break;
        case 'order_status':
            $s     = get_post_meta( $post_id, '_order_status', true ) ?: 'pending';
            $label = TIM_ORDER_STATUS_LABELS[ $s ] ?? $s;
            $color = TIM_ORDER_STATUS_COLORS[ $s ] ?? '#6b7280';
            echo '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;color:#fff;background:' . esc_attr( $color ) . ';">' . esc_html( $label ) . '</span>';
            break;
        case 'order_cost':
            echo esc_html( number_format_i18n( (int) get_post_meta( $post_id, '_order_cost', true ) ) ) . ' pts';
            break;
    }
}, 10, 2 );

add_action( 'add_meta_boxes', function () {
    add_meta_box( 'tim_order_meta', 'Détails & statut', '_tim_order_render_meta_box', 'reward_order', 'side', 'high' );
} );

function _tim_order_render_meta_box( WP_Post $post ): void {
    wp_nonce_field( 'tim_order_meta', 'tim_order_nonce' );
    $status    = get_post_meta( $post->ID, '_order_status', true ) ?: 'pending';
    $email     = get_post_meta( $post->ID, '_order_user_email', true );
    $cost      = (int) get_post_meta( $post->ID, '_order_cost', true );
    $reward_id = (int) get_post_meta( $post->ID, '_order_reward_id', true );

    echo '<p><strong>Partenaire :</strong><br><a href="mailto:' . esc_attr( $email ) . '">' . esc_html( $email ) . '</a></p>';
    echo '<p><strong>Récompense :</strong><br>' . esc_html( get_the_title( $reward_id ) ) . '</p>';
    echo '<p><strong>Coût :</strong> ' . esc_html( (string) $cost ) . ' points</p>';
    echo '<p><strong>Solde actuel du partenaire :</strong> ' . esc_html( (string) _tim_points_balance( $email ) ) . ' points</p>';

    echo '<p><label for="tim_order_status"><strong>Statut :</strong></label><br>';
    echo '<select name="tim_order_status" id="tim_order_status" style="width:100%;">';
    foreach ( TIM_ORDER_STATUSES as $s ) {
        echo "<option value='" . esc_attr( $s ) . "' " . selected( $status, $s, false ) . '>' . esc_html( TIM_ORDER_STATUS_LABELS[ $s ] ?? $s ) . '</option>';
    }
    echo '</select></p>';
    echo '<p class="description">Passer à « Annulée » rembourse automatiquement les points au partenaire (une seule fois).</p>';
}

add_action( 'save_post_reward_order', function ( $post_id ) {
    if ( ! isset( $_POST['tim_order_nonce'] ) ) return;
    if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['tim_order_nonce'] ) ), 'tim_order_meta' ) ) return;
    if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) return;
    if ( ! current_user_can( 'edit_post', $post_id ) ) return;
    if ( ! isset( $_POST['tim_order_status'] ) ) return;

    $new = sanitize_text_field( wp_unslash( $_POST['tim_order_status'] ) );
    if ( ! in_array( $new, TIM_ORDER_STATUSES, true ) ) return;

    $old = get_post_meta( $post_id, '_order_status', true ) ?: 'pending';
    if ( $new === $old ) return;

    update_post_meta( $post_id, '_order_status', $new );

    // Remboursement à l'annulation — idempotent via un flag.
    if ( $new === 'cancelled' && ! get_post_meta( $post_id, '_order_refunded', true ) ) {
        $email = get_post_meta( $post_id, '_order_user_email', true );
        $cost  = (int) get_post_meta( $post_id, '_order_cost', true );
        $number = get_post_meta( $post_id, '_order_number', true );
        if ( $email && $cost > 0 ) {
            _tim_points_add( $email, $cost, 'Remboursement commande #' . $number, 'ajustement', 'order:' . $post_id );
            update_post_meta( $post_id, '_order_refunded', 1 );

            // Restock si la récompense a un stock fini.
            $reward_id = (int) get_post_meta( $post_id, '_order_reward_id', true );
            $stock = get_post_meta( $reward_id, '_reward_stock', true );
            if ( $stock !== '' && (int) $stock >= 0 ) {
                update_post_meta( $reward_id, '_reward_stock', (int) $stock + 1 );
            }
        }
    }
}, 10 );

// ─── Admin : page « Attribuer des points » ────────────────────────────────────

add_action( 'admin_menu', function () {
    add_menu_page(
        'Partenaires',
        'Partenaires',
        'manage_options',
        'tim-partenaires',
        '_tim_render_partners_page',
        'dashicons-groups',
        26
    );
    add_submenu_page( 'tim-partenaires', 'Attribuer des points', '➕ Attribuer des points', 'manage_options', 'tim-partenaires', '_tim_render_partners_page' );
    add_submenu_page( 'tim-partenaires', 'Récompenses', '🎁 Récompenses', 'manage_options', 'edit.php?post_type=reward' );
    add_submenu_page( 'tim-partenaires', 'Commandes',   '🛒 Commandes',   'manage_options', 'edit.php?post_type=reward_order' );
} );

// Garde le menu « Partenaires » ouvert et le bon sous-menu surligné sur les
// écrans des CPT rattachés (liste, ajout, édition).
const TIM_PARTNER_CPTS = [ 'reward', 'reward_order', 'mission', 'mission_submission' ];

add_filter( 'parent_file', function ( $parent_file ) {
    $screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
    if ( $screen && in_array( $screen->post_type, TIM_PARTNER_CPTS, true ) ) {
        return 'tim-partenaires';
    }
    return $parent_file;
} );

add_filter( 'submenu_file', function ( $submenu_file ) {
    $screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
    if ( $screen && in_array( $screen->post_type, TIM_PARTNER_CPTS, true ) ) {
        return 'edit.php?post_type=' . $screen->post_type;
    }
    return $submenu_file;
} );

function _tim_render_partners_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Accès refusé.' );

    $message = '';
    $error   = '';

    // Attribution
    if (
        isset( $_POST['tim_action'] ) && $_POST['tim_action'] === 'grant_points' &&
        check_admin_referer( 'tim_grant_points' )
    ) {
        $email  = _tim_normalize_email( sanitize_text_field( wp_unslash( $_POST['tim_email'] ?? '' ) ) );
        $points = (int) ( $_POST['tim_points'] ?? 0 );
        $motif  = sanitize_text_field( wp_unslash( $_POST['tim_motif'] ?? '' ) );
        $source = sanitize_text_field( wp_unslash( $_POST['tim_source'] ?? 'ajustement' ) );

        if ( ! is_email( $email ) ) {
            $error = 'Email invalide.';
        } elseif ( $points === 0 ) {
            $error = 'Le nombre de points ne peut pas être nul (utilisez un négatif pour retirer).';
        } elseif ( ! in_array( $source, TIM_POINTS_SOURCES, true ) ) {
            $error = 'Source invalide.';
        } else {
            $id = _tim_points_add( $email, $points, $motif, $source, null, get_current_user_id() );
            if ( $id ) {
                $message = sprintf(
                    '%s%d point(s) %s « %s ». Nouveau solde : %d pts.',
                    $points > 0 ? '+' : '', $points,
                    $points > 0 ? 'attribués à' : 'retirés de', $email,
                    _tim_points_balance( $email )
                );
            } else {
                $error = 'Échec de l\'enregistrement.';
            }
        }
    }

    // Recherche par CODE partenaire → résout vers l'email du partenaire.
    $lookup_code = sanitize_text_field( wp_unslash( $_GET['code'] ?? '' ) );
    if ( $lookup_code !== '' && function_exists( '_tim_email_by_code' ) ) {
        $resolved = _tim_email_by_code( $lookup_code );
        $_GET['lookup'] = $resolved ?: '';
        if ( ! $resolved ) {
            $error = $error ?: 'Aucun partenaire trouvé pour le code « ' . $lookup_code . ' ».';
        }
    }

    // Recherche du solde d'un partenaire
    $lookup_email   = _tim_normalize_email( sanitize_text_field( wp_unslash( $_GET['lookup'] ?? '' ) ) );
    $lookup_balance = $lookup_email && is_email( $lookup_email ) ? _tim_points_balance( $lookup_email ) : null;
    $lookup_history = $lookup_email && is_email( $lookup_email ) ? _tim_points_history( $lookup_email, 50 ) : [];
    ?>
    <div class="wrap">
        <h1>Partenaires — Points</h1>

        <?php if ( $message ) : ?>
            <div class="notice notice-success is-dismissible"><p><strong><?php echo esc_html( $message ); ?></strong></p></div>
        <?php endif; ?>
        <?php if ( $error ) : ?>
            <div class="notice notice-error is-dismissible"><p><strong><?php echo esc_html( $error ); ?></strong></p></div>
        <?php endif; ?>

        <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;margin-top:1em;">

            <div class="card" style="flex:1;min-width:340px;">
                <h2 class="title">➕ Attribuer des points</h2>
                <form method="post">
                    <?php wp_nonce_field( 'tim_grant_points' ); ?>
                    <input type="hidden" name="tim_action" value="grant_points">
                    <table class="form-table">
                        <tr>
                            <th><label for="tim_email">Email du partenaire</label></th>
                            <td><input type="email" name="tim_email" id="tim_email" class="regular-text" required
                                       value="<?php echo esc_attr( $lookup_email ); ?>"></td>
                        </tr>
                        <tr>
                            <th><label for="tim_points">Points</label></th>
                            <td><input type="number" name="tim_points" id="tim_points" step="1" required style="width:120px;">
                                <span class="description">négatif = retrait</span></td>
                        </tr>
                        <tr>
                            <th><label for="tim_source">Source</label></th>
                            <td><select name="tim_source" id="tim_source">
                                <?php foreach ( TIM_POINTS_SOURCES as $s ) : ?>
                                    <option value="<?php echo esc_attr( $s ); ?>"><?php echo esc_html( TIM_POINTS_SOURCE_LABELS[ $s ] ); ?></option>
                                <?php endforeach; ?>
                            </select></td>
                        </tr>
                        <tr>
                            <th><label for="tim_motif">Motif</label></th>
                            <td><input type="text" name="tim_motif" id="tim_motif" class="regular-text"
                                       placeholder="ex : Contrat Dupont signé le 12/06"></td>
                        </tr>
                    </table>
                    <p><button type="submit" class="button button-primary">Enregistrer la transaction</button></p>
                </form>
            </div>

            <div class="card" style="flex:1;min-width:340px;">
                <h2 class="title">🔎 Solde & historique d'un partenaire</h2>
                <form method="get">
                    <input type="hidden" name="page" value="tim-partenaires">
                    <p>
                        <input type="email" name="lookup" class="regular-text" placeholder="email@partenaire.fr"
                               value="<?php echo esc_attr( $lookup_email ); ?>">
                        <button type="submit" class="button">Rechercher par email</button>
                    </p>
                </form>
                <form method="get">
                    <input type="hidden" name="page" value="tim-partenaires">
                    <p>
                        <input type="text" name="code" class="regular-text" placeholder="TIM-XXXXXX"
                               style="text-transform:uppercase;">
                        <button type="submit" class="button">Rechercher par code partenaire</button>
                        <span class="description">Pour identifier l'apporteur d'un lead.</span>
                    </p>
                </form>
                <?php if ( $lookup_balance !== null ) : ?>
                    <p style="font-size:18px;margin-bottom:4px;"><strong>Solde : <?php echo esc_html( number_format_i18n( $lookup_balance ) ); ?> pts</strong></p>
                    <?php if ( function_exists( '_tim_partner_code' ) ) : ?>
                        <p style="margin-top:0;">Code partenaire : <code style="font-size:14px;"><?php echo esc_html( _tim_partner_code( $lookup_email ) ); ?></code></p>
                    <?php endif; ?>
                    <?php if ( $lookup_history ) : ?>
                        <table class="widefat striped">
                            <thead><tr><th>Date</th><th>Pts</th><th>Source</th><th>Motif</th></tr></thead>
                            <tbody>
                            <?php foreach ( $lookup_history as $h ) : ?>
                                <tr>
                                    <td><?php echo esc_html( mysql2date( 'd/m/Y H:i', $h['created_at'] ) ); ?></td>
                                    <td style="color:<?php echo $h['delta'] >= 0 ? '#16a34a' : '#dc2626'; ?>;font-weight:600;">
                                        <?php echo esc_html( ( $h['delta'] >= 0 ? '+' : '' ) . $h['delta'] ); ?>
                                    </td>
                                    <td><?php echo esc_html( TIM_POINTS_SOURCE_LABELS[ $h['source'] ] ?? $h['source'] ); ?></td>
                                    <td><?php echo esc_html( $h['motif'] ); ?></td>
                                </tr>
                            <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php else : ?>
                        <p class="description">Aucune transaction pour ce partenaire.</p>
                    <?php endif; ?>
                <?php endif; ?>
            </div>

        </div>
    </div>
    <?php
}
