import * as migration_20260729_130116_initial from './20260729_130116_initial';
import * as migration_20260729_212104_add_client_contacts_and_client_contract from './20260729_212104_add_client_contacts_and_client_contract';
import * as migration_20260729_213846_add_client_status_prospect_en_cours from './20260729_213846_add_client_status_prospect_en_cours';
import * as migration_20260730_063808_remove_client_contact_status from './20260730_063808_remove_client_contact_status';
import * as migration_20260731_101342_add_client_status_rank from './20260731_101342_add_client_status_rank';
import * as migration_20260803_163806_add_client_status_en_test from './20260803_163806_add_client_status_en_test';
import * as migration_20260803_171040_add_mission_steps from './20260803_171040_add_mission_steps';
import * as migration_20260804_153500_add_ticket_identity_fields from './20260804_153500_add_ticket_identity_fields';
import * as migration_20260805_075058_add_ticket_message_cc from './20260805_075058_add_ticket_message_cc';
import * as migration_20260805_152942_add_reward_purchase_price from './20260805_152942_add_reward_purchase_price';
import * as migration_20260805_163141_add_partner_display_name from './20260805_163141_add_partner_display_name';
import * as migration_20260807_091707_add_marketing_journeys from './20260807_091707_add_marketing_journeys';
import * as migration_20260807_093301_add_client_onboarding from './20260807_093301_add_client_onboarding';
import * as migration_20260807_094727_add_site_code_and_required from './20260807_094727_add_site_code_and_required';
import * as migration_20260807_132035_add_client_portal from './20260807_132035_add_client_portal';
import * as migration_20260807_135837_add_journey_emails from './20260807_135837_add_journey_emails';
import * as migration_20260807_141157_add_email_audience_tim from './20260807_141157_add_email_audience_tim';
import * as migration_20260807_143732_rename_and_default_prospect from './20260807_143732_rename_and_default_prospect';
import * as migration_20260807_144358_add_session_mode from './20260807_144358_add_session_mode';
import * as migration_20260807_150235_add_partner_scheduling from './20260807_150235_add_partner_scheduling';
import * as migration_20260807_151751_add_calendar_connections from './20260807_151751_add_calendar_connections';
import * as migration_20260807_154524_add_booking_mode from './20260807_154524_add_booking_mode';
import * as migration_20260811_072415_add_step_auto_validate from './20260811_072415_add_step_auto_validate';
import * as migration_20260812_091752_add_run_email_schedule from './20260812_091752_add_run_email_schedule';
import * as migration_20260812_095100_add_email_send_hour from './20260812_095100_add_email_send_hour';
import * as migration_20260812_105112_add_ticket_journey_run from './20260812_105112_add_ticket_journey_run';

export const migrations = [
  {
    up: migration_20260729_130116_initial.up,
    down: migration_20260729_130116_initial.down,
    name: '20260729_130116_initial',
  },
  {
    up: migration_20260729_212104_add_client_contacts_and_client_contract.up,
    down: migration_20260729_212104_add_client_contacts_and_client_contract.down,
    name: '20260729_212104_add_client_contacts_and_client_contract',
  },
  {
    up: migration_20260729_213846_add_client_status_prospect_en_cours.up,
    down: migration_20260729_213846_add_client_status_prospect_en_cours.down,
    name: '20260729_213846_add_client_status_prospect_en_cours',
  },
  {
    up: migration_20260730_063808_remove_client_contact_status.up,
    down: migration_20260730_063808_remove_client_contact_status.down,
    name: '20260730_063808_remove_client_contact_status',
  },
  {
    up: migration_20260731_101342_add_client_status_rank.up,
    down: migration_20260731_101342_add_client_status_rank.down,
    name: '20260731_101342_add_client_status_rank',
  },
  {
    up: migration_20260803_163806_add_client_status_en_test.up,
    down: migration_20260803_163806_add_client_status_en_test.down,
    name: '20260803_163806_add_client_status_en_test',
  },
  {
    up: migration_20260803_171040_add_mission_steps.up,
    down: migration_20260803_171040_add_mission_steps.down,
    name: '20260803_171040_add_mission_steps',
  },
  {
    up: migration_20260804_153500_add_ticket_identity_fields.up,
    down: migration_20260804_153500_add_ticket_identity_fields.down,
    name: '20260804_153500_add_ticket_identity_fields',
  },
  {
    up: migration_20260805_075058_add_ticket_message_cc.up,
    down: migration_20260805_075058_add_ticket_message_cc.down,
    name: '20260805_075058_add_ticket_message_cc',
  },
  {
    up: migration_20260805_152942_add_reward_purchase_price.up,
    down: migration_20260805_152942_add_reward_purchase_price.down,
    name: '20260805_152942_add_reward_purchase_price',
  },
  {
    up: migration_20260805_163141_add_partner_display_name.up,
    down: migration_20260805_163141_add_partner_display_name.down,
    name: '20260805_163141_add_partner_display_name',
  },
  {
    up: migration_20260807_091707_add_marketing_journeys.up,
    down: migration_20260807_091707_add_marketing_journeys.down,
    name: '20260807_091707_add_marketing_journeys',
  },
  {
    up: migration_20260807_093301_add_client_onboarding.up,
    down: migration_20260807_093301_add_client_onboarding.down,
    name: '20260807_093301_add_client_onboarding',
  },
  {
    up: migration_20260807_094727_add_site_code_and_required.up,
    down: migration_20260807_094727_add_site_code_and_required.down,
    name: '20260807_094727_add_site_code_and_required',
  },
  {
    up: migration_20260807_132035_add_client_portal.up,
    down: migration_20260807_132035_add_client_portal.down,
    name: '20260807_132035_add_client_portal',
  },
  {
    up: migration_20260807_135837_add_journey_emails.up,
    down: migration_20260807_135837_add_journey_emails.down,
    name: '20260807_135837_add_journey_emails',
  },
  {
    up: migration_20260807_141157_add_email_audience_tim.up,
    down: migration_20260807_141157_add_email_audience_tim.down,
    name: '20260807_141157_add_email_audience_tim',
  },
  {
    up: migration_20260807_143732_rename_and_default_prospect.up,
    down: migration_20260807_143732_rename_and_default_prospect.down,
    name: '20260807_143732_rename_and_default_prospect',
  },
  {
    up: migration_20260807_144358_add_session_mode.up,
    down: migration_20260807_144358_add_session_mode.down,
    name: '20260807_144358_add_session_mode',
  },
  {
    up: migration_20260807_150235_add_partner_scheduling.up,
    down: migration_20260807_150235_add_partner_scheduling.down,
    name: '20260807_150235_add_partner_scheduling',
  },
  {
    up: migration_20260807_151751_add_calendar_connections.up,
    down: migration_20260807_151751_add_calendar_connections.down,
    name: '20260807_151751_add_calendar_connections',
  },
  {
    up: migration_20260807_154524_add_booking_mode.up,
    down: migration_20260807_154524_add_booking_mode.down,
    name: '20260807_154524_add_booking_mode',
  },
  {
    up: migration_20260811_072415_add_step_auto_validate.up,
    down: migration_20260811_072415_add_step_auto_validate.down,
    name: '20260811_072415_add_step_auto_validate',
  },
  {
    up: migration_20260812_091752_add_run_email_schedule.up,
    down: migration_20260812_091752_add_run_email_schedule.down,
    name: '20260812_091752_add_run_email_schedule',
  },
  {
    up: migration_20260812_095100_add_email_send_hour.up,
    down: migration_20260812_095100_add_email_send_hour.down,
    name: '20260812_095100_add_email_send_hour',
  },
  {
    up: migration_20260812_105112_add_ticket_journey_run.up,
    down: migration_20260812_105112_add_ticket_journey_run.down,
    name: '20260812_105112_add_ticket_journey_run'
  },
];
