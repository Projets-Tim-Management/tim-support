<?php
/**
 * Plugin Name: TIM Support API
 * Description: Routes REST API, ACF et feedback pour le site support headless TIM Management
 * Version: 1.0.0
 * Author: Charlie Piancatelli
 */

if ( ! defined( 'ABSPATH' ) ) exit;

require_once plugin_dir_path( __FILE__ ) . 'includes/cors.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/acf.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/search-index.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/routes.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/tickets.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/partners.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/missions.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/parcours.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/revalidate.php';

if ( is_admin() ) {
    require_once plugin_dir_path( __FILE__ ) . 'includes/admin.php';
}
