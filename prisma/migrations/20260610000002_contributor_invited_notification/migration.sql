-- Ajout du type de notification CONTRIBUTOR_INVITED (invitation à un projet).
ALTER TYPE "NotificationType" ADD VALUE 'CONTRIBUTOR_INVITED' BEFORE 'APPROVAL_REQUESTED';
