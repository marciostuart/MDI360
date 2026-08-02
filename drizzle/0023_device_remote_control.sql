-- Remote control of screens: forced cache wipe, reboot, remote screenshot and
-- custom render resolution for panels outside the usual formats.
ALTER TYPE "command_kind" ADD VALUE IF NOT EXISTS 'clear_cache';
ALTER TYPE "command_kind" ADD VALUE IF NOT EXISTS 'reboot';
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "screen_width" integer;
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "screen_height" integer;
