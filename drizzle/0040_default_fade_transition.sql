-- Fade is the default visual language for newly created terminals. Never
-- overwrite existing values: the terminal remains the sole authority for
-- choosing between corte direto and transiÃ§Ã£o suave.
ALTER TABLE "devices" ALTER COLUMN "transition_effect" SET DEFAULT 'fade';
