/** Turns low-level Postgres failures of the queue add-on into readable messages. */
export function toQueueError(error: unknown): Error {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);

  // Tables created by migration 0010_queue_addon are missing on this server.
  if (
    code === "42P01" ||
    /queue_(panels|sectors|calls|sessions)".* does not exist/i.test(message)
  ) {
    return new Error(
      "O add-on de senhas ainda não foi migrado neste servidor. Atualize a stack (re-pull da imagem) para aplicar a migração 0010_queue_addon.",
    );
  }
  if (code === "42501") {
    return new Error(
      "O usuário do banco não tem permissão nas tabelas de senhas. Rode os GRANTs do add-on e tente novamente.",
    );
  }
  if (code === "23505") {
    return new Error("Este usuário de operador já está em uso por outro painel.");
  }
  return error instanceof Error ? error : new Error(message);
}
