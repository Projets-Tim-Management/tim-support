<?php
/**
 * Missions à points — comment les partenaires GAGNENT des points.
 *
 * Une « mission » est une fiche décrivant une façon de gagner des points :
 *   - type « preuve »   : le partenaire réalise l'action (ex. avis Capterra),
 *                         envoie une capture d'écran. Un admin valide → points
 *                         crédités automatiquement dans le ledger.
 *   - type « manuelle » : suivi hors-ligne (leads, parrainage). Le partenaire
 *                         voit son CODE PARTENAIRE unique à communiquer. Les
 *                         points sont attribués à la main (menu Attribuer des
 *                         points) quand l'événement se produit.
 *
 * Dépend de partners.php (chargé avant) : _tim_points_add, _tim_normalize_email,
 * _tim_check_internal_secret, et les constantes d'upload de tickets.php.
 */

if ( ! defined( 'ABSPATH' ) ) exit;

const TIM_MISSION_TYPES = [ 'preuve', 'manuelle' ];

const TIM_MISSION_TYPE_LABELS = [
    'preuve'   => '📸 Sur preuve (capture d\'écran)',
    'manuelle' => '🔗 Suivi manuel (lead / code partenaire)',
];

const TIM_SUBMISSION_STATUSES = [ 'pending', 'approved', 'rejected' ];

const TIM_SUBMISSION_STATUS_LABELS = [
    'pending'  => '🕓 À vérifier',
    'approved' => '✅ Validée (points crédités)',
    'rejected' => '❌ Refusée',
];

const TIM_SUBMISSION_STATUS_COLORS = [
    'pending'  => '#ca8a04',
    'approved' => '#16a34a',
    'rejected' => '#6b7280',
];

const TIM_SUBMISSION_MAX_FILES = 3;

// ─── CPT : missions & soumissions ─────────────────────────────────────────────

add_action( 'init', function () {
    register_post_type( 'mission', [
        'labels' => [
            'name'          => 'Missions',
            'singular_name' => 'Mission',
            'menu_name'     => 'Missions',
            'add_new'       => 'Ajouter',
            'add_new_item'  => 'Ajouter une mission',
            'edit_item'     => 'Modifier la mission',
            'all_items'     => 'Toutes les missions',
            'not_found'     => 'Aucune mission.',
        ],
        'public'          => false,
        'show_ui'         => true,
        'show_in_menu'    => false,  // entrées de menu déclarées explicitement (voir admin_menu)
        'menu_icon'       => 'dashicons-flag',
        'supports'        => [ 'title', 'editor', 'thumbnail', 'page-attributes' ],
        'show_in_rest'    => false,
        'capability_type' => 'post',
        'has_archive'     => false,
        'rewrite'         => false,
    ] );

    register_post_type( 'mission_submission', [
        'labels' => [
            'name'          => 'Soumissions',
            'singular_name' => 'Soumission',
            'menu_name'     => 'Soumissions (preuves)',
            'all_items'     => 'Toutes les soumissions',
            'edit_item'     => 'Vérifier la soumission',
            'not_found'     => 'Aucune soumission.',
        ],
        'public'          => false,
        'show_ui'         => true,
        'show_in_menu'    => false,  // entrées de menu déclarées explicitement (voir admin_menu)
        'menu_icon'       => 'dashicons-yes-alt',
        'supports'        => [ 'title' ],
        'show_in_rest'    => false,
        'capability_type' => 'post',
        'has_archive'     => false,
        'rewrite'         => false,
    ] );
} );

// Entrées de menu (sous « Partenaires », créé dans partners.php). Priorité 11
// pour passer après l'enregistrement du menu parent.
add_action( 'admin_menu', function () {
    add_submenu_page( 'tim-partenaires', 'Missions',    '🏁 Missions',           'manage_options', 'edit.php?post_type=mission' );
    add_submenu_page( 'tim-partenaires', 'Soumissions', '📸 Soumissions (preuves)', 'manage_options', 'edit.php?post_type=mission_submission' );
}, 11 );

// ─── Code partenaire unique ───────────────────────────────────────────────────
//
// Déterministe + mémorisé dans une option (mapping email <-> code) pour
// permettre la recherche inverse côté admin (« à qui appartient ce code ? »).

function _tim_partner_code( string $email ): string {
    $email = _tim_normalize_email( $email );
    if ( $email === '' ) return '';

    $map = get_option( 'tim_partner_codes', [] );
    if ( ! is_array( $map ) ) $map = [];
    if ( ! empty( $map[ $email ] ) ) return $map[ $email ];

    do {
        $code = 'TIM-' . strtoupper( substr( md5( $email . wp_rand() ), 0, 6 ) );
    } while ( in_array( $code, $map, true ) );

    $map[ $email ] = $code;
    update_option( 'tim_partner_codes', $map, false );
    return $code;
}

function _tim_email_by_code( string $code ): ?string {
    $map = get_option( 'tim_partner_codes', [] );
    if ( ! is_array( $map ) ) return null;
    $email = array_search( strtoupper( trim( $code ) ), $map, true );
    return $email === false ? null : (string) $email;
}

// ─── Méta-box mission (points / lien / type) ──────────────────────────────────

add_action( 'add_meta_boxes', function () {
    add_meta_box( 'tim_mission_meta', '🏁 Paramètres de la mission', '_tim_mission_render_meta_box', 'mission', 'side', 'high' );
} );

function _tim_mission_render_meta_box( WP_Post $post ): void {
    wp_nonce_field( 'tim_mission_meta', 'tim_mission_nonce' );
    $points     = (int) get_post_meta( $post->ID, '_mission_points', true );
    $url        = (string) get_post_meta( $post->ID, '_mission_url', true );
    $type       = get_post_meta( $post->ID, '_mission_type', true ) ?: 'preuve';
    $repeatable = (bool) get_post_meta( $post->ID, '_mission_repeatable', true );
    ?>
    <p>
        <label for="tim_mission_points"><strong>Points gagnés</strong></label><br>
        <input type="number" min="0" step="1" id="tim_mission_points" name="tim_mission_points"
               value="<?php echo esc_attr( (string) $points ); ?>" style="width:100%;">
    </p>
    <p>
        <label for="tim_mission_type"><strong>Type de validation</strong></label><br>
        <select name="tim_mission_type" id="tim_mission_type" style="width:100%;">
            <?php foreach ( TIM_MISSION_TYPES as $t ) : ?>
                <option value="<?php echo esc_attr( $t ); ?>" <?php selected( $type, $t ); ?>>
                    <?php echo esc_html( TIM_MISSION_TYPE_LABELS[ $t ] ); ?>
                </option>
            <?php endforeach; ?>
        </select>
    </p>
    <p>
        <label for="tim_mission_url"><strong>Lien (optionnel)</strong></label><br>
        <input type="url" id="tim_mission_url" name="tim_mission_url" placeholder="https://www.capterra.fr/..."
               value="<?php echo esc_attr( $url ); ?>" style="width:100%;">
        <span class="description">Ex : page où laisser l'avis.</span>
    </p>
    <p>
        <label><input type="checkbox" name="tim_mission_repeatable" value="1" <?php checked( $repeatable ); ?>>
        Mission répétable</label><br>
        <span class="description">Décoché = un partenaire ne peut la valider qu'une seule fois.</span>
    </p>
    <p class="description">Image mise en avant = logo. Éditeur = instructions affichées au partenaire.</p>
    <?php
}

add_action( 'save_post_mission', function ( $post_id ) {
    if ( ! isset( $_POST['tim_mission_nonce'] ) ) return;
    if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['tim_mission_nonce'] ) ), 'tim_mission_meta' ) ) return;
    if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) return;
    if ( ! current_user_can( 'edit_post', $post_id ) ) return;

    if ( isset( $_POST['tim_mission_points'] ) ) {
        update_post_meta( $post_id, '_mission_points', max( 0, (int) $_POST['tim_mission_points'] ) );
    }
    if ( isset( $_POST['tim_mission_type'] ) ) {
        $type = sanitize_text_field( wp_unslash( $_POST['tim_mission_type'] ) );
        update_post_meta( $post_id, '_mission_type', in_array( $type, TIM_MISSION_TYPES, true ) ? $type : 'preuve' );
    }
    if ( isset( $_POST['tim_mission_url'] ) ) {
        update_post_meta( $post_id, '_mission_url', esc_url_raw( wp_unslash( $_POST['tim_mission_url'] ) ) );
    }
    update_post_meta( $post_id, '_mission_repeatable', isset( $_POST['tim_mission_repeatable'] ) ? 1 : 0 );
}, 10 );

// Colonnes admin missions
add_filter( 'manage_mission_posts_columns', function () {
    return [ 'cb' => '<input type="checkbox" />', 'title' => 'Mission', 'mission_type' => 'Type', 'mission_points' => 'Points', 'date' => 'Créée le' ];
} );
add_action( 'manage_mission_posts_custom_column', function ( $col, $post_id ) {
    if ( $col === 'mission_points' ) {
        echo '<strong>' . esc_html( number_format_i18n( (int) get_post_meta( $post_id, '_mission_points', true ) ) ) . '</strong> pts';
    } elseif ( $col === 'mission_type' ) {
        $t = get_post_meta( $post_id, '_mission_type', true ) ?: 'preuve';
        echo esc_html( TIM_MISSION_TYPE_LABELS[ $t ] ?? $t );
    }
}, 10, 2 );

// ─── Statut d'une mission pour un partenaire donné ────────────────────────────

function _tim_mission_partner_status( int $mission_id, string $email ): string {
    $email = _tim_normalize_email( $email );
    if ( $email === '' ) return 'none';

    $subs = get_posts( [
        'post_type'      => 'mission_submission',
        'post_status'    => 'publish',
        'posts_per_page' => 1,
        'meta_query'     => [
            'relation' => 'AND',
            [ 'key' => '_sub_mission_id', 'value' => $mission_id ],
            [ 'key' => '_sub_user_email', 'value' => $email ],
            [ 'key' => '_sub_status', 'value' => [ 'pending', 'approved' ], 'compare' => 'IN' ],
        ],
        'fields' => 'ids',
    ] );

    if ( empty( $subs ) ) return 'none';
    $status = get_post_meta( $subs[0], '_sub_status', true );
    return $status === 'approved' ? 'approved' : 'pending';
}

function _tim_format_mission( WP_Post $post, string $email ): array {
    $thumb_id = get_post_thumbnail_id( $post->ID );
    return [
        'id'             => $post->ID,
        'title'          => $post->post_title,
        'description'    => wp_strip_all_tags( $post->post_content ),
        'points'         => (int) get_post_meta( $post->ID, '_mission_points', true ),
        'url'            => (string) get_post_meta( $post->ID, '_mission_url', true ),
        'type'           => get_post_meta( $post->ID, '_mission_type', true ) ?: 'preuve',
        'image'          => $thumb_id ? wp_get_attachment_image_url( $thumb_id, 'medium' ) : null,
        'repeatable'     => (bool) get_post_meta( $post->ID, '_mission_repeatable', true ),
        'partner_status' => _tim_mission_partner_status( $post->ID, $email ),
    ];
}

// ─── Upload des captures de preuve ────────────────────────────────────────────

function _tim_handle_submission_attachments( int $post_id ): array {
    if ( empty( $_FILES ) ) return [];

    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';

    $attached = [];
    foreach ( $_FILES as $file ) {
        if ( count( $attached ) >= TIM_SUBMISSION_MAX_FILES ) break;
        if ( ( $file['error'] ?? UPLOAD_ERR_NO_FILE ) !== UPLOAD_ERR_OK ) continue;

        $finfo = function_exists( 'finfo_open' ) ? finfo_open( FILEINFO_MIME_TYPE ) : null;
        $mime  = $finfo ? finfo_file( $finfo, $file['tmp_name'] ) : ( $file['type'] ?? '' );
        if ( $finfo ) finfo_close( $finfo );
        if ( ! in_array( $mime, TIM_TICKET_ALLOWED_MIMES, true ) ) continue;
        if ( ! empty( $file['size'] ) && $file['size'] > TIM_TICKET_MAX_FILE_SIZE ) continue;

        $check = wp_check_filetype( $file['name'] );
        if ( ! in_array( $check['ext'], TIM_TICKET_ALLOWED_EXTS, true ) ) continue;

        $upload = wp_handle_upload( $file, [ 'test_form' => false ] );
        if ( ! empty( $upload['error'] ) || empty( $upload['file'] ) ) continue;

        $att_id = wp_insert_attachment( [
            'post_mime_type' => $upload['type'],
            'post_title'     => sanitize_text_field( pathinfo( $file['name'], PATHINFO_FILENAME ) ),
            'post_status'    => 'inherit',
            'post_parent'    => $post_id,
        ], $upload['file'], $post_id, true );
        if ( is_wp_error( $att_id ) ) continue;

        wp_update_attachment_metadata( $att_id, wp_generate_attachment_metadata( $att_id, $upload['file'] ) );
        $attached[] = (int) $att_id;
    }

    if ( ! empty( $attached ) ) {
        update_post_meta( $post_id, '_sub_attachments', $attached );
    }
    return $attached;
}

function _tim_generate_submission_number(): int {
    global $wpdb;
    for ( $i = 0; $i < 20; $i++ ) {
        $num = wp_rand( 1000, 99999 );
        $exists = $wpdb->get_var( $wpdb->prepare(
            "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_sub_number' AND meta_value = %s LIMIT 1",
            $num
        ) );
        if ( ! $exists ) return $num;
    }
    return wp_rand( 100000, 999999 );
}

// ─── Routes REST ──────────────────────────────────────────────────────────────

add_action( 'rest_api_init', function () {

    // Liste des missions actives (avec statut pour le partenaire).
    register_rest_route( 'tim-support/v1', '/missions', [
        'methods'             => 'GET',
        'permission_callback' => '_tim_check_internal_secret',
        'args'                => [ 'email' => [ 'required' => true, 'type' => 'string' ] ],
        'callback'            => function ( WP_REST_Request $req ) {
            $email = _tim_normalize_email( (string) $req->get_param( 'email' ) );
            $posts = get_posts( [
                'post_type'      => 'mission',
                'post_status'    => 'publish',
                'posts_per_page' => 200,
                'orderby'        => [ 'menu_order' => 'ASC', 'date' => 'DESC' ],
            ] );
            return rest_ensure_response( array_map( fn( $p ) => _tim_format_mission( $p, $email ), $posts ) );
        },
    ] );

    // Soumission d'une preuve (multipart : champs + capture(s)).
    register_rest_route( 'tim-support/v1', '/missions/submit', [
        'methods'             => 'POST',
        'permission_callback' => '_tim_check_internal_secret',
        'callback'            => '_tim_rest_mission_submit',
    ] );

} );

function _tim_rest_mission_submit( WP_REST_Request $req ) {
    $email          = _tim_normalize_email( (string) $req->get_param( 'email' ) );
    $mission_id     = absint( $req->get_param( 'mission_id' ) );
    $note           = sanitize_textarea_field( (string) ( $req->get_param( 'note' ) ?? '' ) );
    $reviewer_email = sanitize_email( (string) ( $req->get_param( 'reviewer_email' ) ?? '' ) );

    if ( ! is_email( $email ) ) {
        return new WP_Error( 'invalid_email', 'Email invalide.', [ 'status' => 400 ] );
    }

    $mission = get_post( $mission_id );
    if ( ! $mission || $mission->post_type !== 'mission' || $mission->post_status !== 'publish' ) {
        return new WP_Error( 'mission_not_found', 'Mission introuvable.', [ 'status' => 404 ] );
    }

    // Anti-doublon : si non répétable et déjà soumise/validée → refus.
    $repeatable = (bool) get_post_meta( $mission_id, '_mission_repeatable', true );
    if ( ! $repeatable && _tim_mission_partner_status( $mission_id, $email ) !== 'none' ) {
        return new WP_Error( 'already_submitted', 'Vous avez déjà soumis cette mission.', [ 'status' => 409 ] );
    }

    if ( empty( $_FILES ) ) {
        return new WP_Error( 'no_file', 'Ajoutez au moins une capture d\'écran.', [ 'status' => 400 ] );
    }

    $number  = _tim_generate_submission_number();
    $post_id = wp_insert_post( [
        'post_type'   => 'mission_submission',
        'post_title'  => sprintf( '#%d — %s — %s', $number, $mission->post_title, $email ),
        'post_status' => 'publish',
    ], true );
    if ( is_wp_error( $post_id ) ) {
        return new WP_Error( 'save_failed', 'Erreur serveur.', [ 'status' => 500 ] );
    }

    update_post_meta( $post_id, '_sub_number',     $number );
    update_post_meta( $post_id, '_sub_mission_id', $mission_id );
    update_post_meta( $post_id, '_sub_user_email', $email );
    update_post_meta( $post_id, '_sub_note',       $note );
    update_post_meta( $post_id, '_sub_status',     'pending' );
    if ( is_email( $reviewer_email ) ) {
        update_post_meta( $post_id, '_sub_reviewer_email', $reviewer_email );
    }

    $attached = _tim_handle_submission_attachments( $post_id );
    if ( empty( $attached ) ) {
        // Aucune image valide retenue → on annule pour ne pas créer de soumission vide.
        wp_delete_post( $post_id, true );
        return new WP_Error( 'no_valid_file', 'Capture invalide (format/taille). Formats acceptés : JPG, PNG, GIF, WebP (max 5 Mo).', [ 'status' => 400 ] );
    }

    _tim_notify_admin_new_submission( $post_id, $mission_id, $email, $number );

    return rest_ensure_response( [ 'success' => true, 'submission_number' => $number ] );
}

function _tim_notify_admin_new_submission( int $post_id, int $mission_id, string $email, int $number ): void {
    $to = defined( 'TIM_TICKETS_NOTIFY_EMAIL' ) ? TIM_TICKETS_NOTIFY_EMAIL : get_option( 'admin_email' );
    $points = (int) get_post_meta( $mission_id, '_mission_points', true );
    $link   = admin_url( 'post.php?action=edit&post=' . $post_id );
    $body   = "Nouvelle preuve à vérifier (espace partenaires).\n\n";
    $body  .= 'Mission    : ' . get_the_title( $mission_id ) . "\n";
    $body  .= "Partenaire : $email\n";
    $body  .= "Points     : $points (crédités si vous validez)\n\n";
    $body  .= "Vérifier : $link\n";
    wp_mail( $to, "[Preuve #$number] " . get_the_title( $mission_id ), $body );
}

// ─── Admin : vérification d'une soumission (valider = créditer) ────────────────

add_filter( 'manage_mission_submission_posts_columns', function () {
    return [
        'cb'         => '<input type="checkbox" />',
        'sub_number' => 'N°',
        'title'      => 'Soumission',
        'sub_status' => 'Statut',
        'date'       => 'Reçue le',
    ];
} );
add_action( 'manage_mission_submission_posts_custom_column', function ( $col, $post_id ) {
    if ( $col === 'sub_number' ) {
        echo '<strong style="font-family:monospace;">#' . esc_html( (string) get_post_meta( $post_id, '_sub_number', true ) ) . '</strong>';
    } elseif ( $col === 'sub_status' ) {
        $s     = get_post_meta( $post_id, '_sub_status', true ) ?: 'pending';
        $color = TIM_SUBMISSION_STATUS_COLORS[ $s ] ?? '#6b7280';
        echo '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;color:#fff;background:' . esc_attr( $color ) . ';">' . esc_html( TIM_SUBMISSION_STATUS_LABELS[ $s ] ?? $s ) . '</span>';
    }
}, 10, 2 );

add_action( 'add_meta_boxes', function () {
    add_meta_box( 'tim_submission_meta', 'Vérification de la preuve', '_tim_submission_render_meta_box', 'mission_submission', 'normal', 'high' );
} );

function _tim_submission_render_meta_box( WP_Post $post ): void {
    wp_nonce_field( 'tim_submission_meta', 'tim_submission_nonce' );
    $mission_id = (int) get_post_meta( $post->ID, '_sub_mission_id', true );
    $email      = (string) get_post_meta( $post->ID, '_sub_user_email', true );
    $status     = get_post_meta( $post->ID, '_sub_status', true ) ?: 'pending';
    $note       = (string) get_post_meta( $post->ID, '_sub_note', true );
    $reviewer   = (string) get_post_meta( $post->ID, '_sub_reviewer_email', true );
    $points     = (int) get_post_meta( $mission_id, '_mission_points', true );
    $url        = (string) get_post_meta( $mission_id, '_mission_url', true );
    $attachments = get_post_meta( $post->ID, '_sub_attachments', true );

    echo '<p><strong>Mission :</strong> ' . esc_html( get_the_title( $mission_id ) ) . ' — <strong>' . esc_html( (string) $points ) . ' pts</strong></p>';
    echo '<p><strong>Partenaire :</strong> <a href="mailto:' . esc_attr( $email ) . '">' . esc_html( $email ) . '</a> (solde actuel : ' . esc_html( (string) _tim_points_balance( $email ) ) . ' pts)</p>';
    if ( $url ) {
        echo '<p><strong>Lien de la mission :</strong> <a href="' . esc_url( $url ) . '" target="_blank" rel="noopener">' . esc_html( $url ) . '</a></p>';
    }
    if ( $reviewer ) {
        echo '<p><strong>Email de l\'auteur de l\'avis :</strong> <a href="mailto:' . esc_attr( $reviewer ) . '">' . esc_html( $reviewer ) . '</a></p>';
    }
    if ( $note ) {
        echo '<p><strong>Note du partenaire :</strong><br>' . esc_html( $note ) . '</p>';
    }

    if ( is_array( $attachments ) && ! empty( $attachments ) ) {
        echo '<p><strong>Capture(s) d\'écran :</strong></p><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">';
        foreach ( $attachments as $att_id ) {
            $thumb = wp_get_attachment_image_url( (int) $att_id, 'medium' );
            $full  = wp_get_attachment_url( (int) $att_id );
            if ( $thumb && $full ) {
                echo '<a href="' . esc_url( $full ) . '" target="_blank" rel="noopener"><img src="' . esc_url( $thumb ) . '" style="max-width:240px;height:auto;border-radius:6px;border:1px solid #ddd;" /></a>';
            }
        }
        echo '</div>';
    }

    if ( get_post_meta( $post->ID, '_sub_credited', true ) ) {
        echo '<p style="color:#16a34a;font-weight:600;">✅ Points déjà crédités pour cette soumission.</p>';
    }

    echo '<p><label for="tim_submission_status"><strong>Décision :</strong></label><br>';
    echo '<select name="tim_submission_status" id="tim_submission_status" style="min-width:260px;">';
    foreach ( TIM_SUBMISSION_STATUSES as $s ) {
        echo "<option value='" . esc_attr( $s ) . "' " . selected( $status, $s, false ) . '>' . esc_html( TIM_SUBMISSION_STATUS_LABELS[ $s ] ?? $s ) . '</option>';
    }
    echo '</select></p>';
    echo '<p class="description">Passer à « Validée » crédite ' . esc_html( (string) $points ) . ' points au partenaire (une seule fois).</p>';
}

add_action( 'save_post_mission_submission', function ( $post_id ) {
    if ( ! isset( $_POST['tim_submission_nonce'] ) ) return;
    if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['tim_submission_nonce'] ) ), 'tim_submission_meta' ) ) return;
    if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) return;
    if ( ! current_user_can( 'edit_post', $post_id ) ) return;
    if ( ! isset( $_POST['tim_submission_status'] ) ) return;

    $new = sanitize_text_field( wp_unslash( $_POST['tim_submission_status'] ) );
    if ( ! in_array( $new, TIM_SUBMISSION_STATUSES, true ) ) return;

    $old = get_post_meta( $post_id, '_sub_status', true ) ?: 'pending';
    update_post_meta( $post_id, '_sub_status', $new );

    // Validation → crédit unique.
    if ( $new === 'approved' && ! get_post_meta( $post_id, '_sub_credited', true ) ) {
        $email      = (string) get_post_meta( $post_id, '_sub_user_email', true );
        $mission_id = (int) get_post_meta( $post_id, '_sub_mission_id', true );
        $points     = (int) get_post_meta( $mission_id, '_mission_points', true );
        $number     = get_post_meta( $post_id, '_sub_number', true );

        if ( $email && $points > 0 ) {
            $source = ( get_post_meta( $mission_id, '_mission_type', true ) === 'manuelle' ) ? 'ajustement' : 'avis';
            _tim_points_add( $email, $points, 'Mission validée : ' . get_the_title( $mission_id ) . ' (#' . $number . ')', $source, 'submission:' . $post_id );
            update_post_meta( $post_id, '_sub_credited', 1 );

            // Notifie le partenaire.
            if ( is_email( $email ) ) {
                $body  = "Bonjour,\n\nVotre preuve pour « " . get_the_title( $mission_id ) . " » a été validée.\n";
                $body .= "+$points points ont été crédités sur votre compte.\n";
                $body .= 'Nouveau solde : ' . _tim_points_balance( $email ) . " points.\n\nL'équipe TIM Management";
                wp_mail( $email, '[TIM Management] +' . $points . ' points crédités 🎉', $body );
            }
        }
    }
}, 10 );
