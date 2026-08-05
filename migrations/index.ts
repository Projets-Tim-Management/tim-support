import * as migration_20260729_130116_initial from './20260729_130116_initial';
import * as migration_20260729_212104_add_client_contacts_and_client_contract from './20260729_212104_add_client_contacts_and_client_contract';
import * as migration_20260729_213846_add_client_status_prospect_en_cours from './20260729_213846_add_client_status_prospect_en_cours';
import * as migration_20260730_063808_remove_client_contact_status from './20260730_063808_remove_client_contact_status';
import * as migration_20260731_101342_add_client_status_rank from './20260731_101342_add_client_status_rank';
import * as migration_20260803_163806_add_client_status_en_test from './20260803_163806_add_client_status_en_test';
import * as migration_20260803_171040_add_mission_steps from './20260803_171040_add_mission_steps';
import * as migration_20260804_153500_add_ticket_identity_fields from './20260804_153500_add_ticket_identity_fields';
import * as migration_20260805_075058_add_ticket_message_cc from './20260805_075058_add_ticket_message_cc';

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
    name: '20260805_075058_add_ticket_message_cc'
  },
];
