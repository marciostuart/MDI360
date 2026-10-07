type ActivationScreenProps = {
  code: string | null;
  message?: string | null;
};

/** Shared activation view for browser terminals and the Android WebView. */
export function ActivationScreen({ code, message }: ActivationScreenProps) {
  return (
    <div className="grid min-h-screen place-items-center bg-[#0b1220] px-6 text-center text-white">
      <div className="w-full max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.4em] text-[#a3e635]">MDI 360</p>
        <h1 className="mt-4 text-2xl font-semibold sm:text-3xl">Vincular terminal</h1>
        <p className="mt-2 text-sm text-white/60 sm:text-base">
          No painel MDI 360, abra <span className="font-medium text-white/80">Terminais</span> e use
          <span className="font-medium text-white/80"> Vincular terminal</span> com o código abaixo.
        </p>
        <p className="mx-auto mt-10 w-fit rounded-2xl border border-[#a3e635]/50 bg-[#111c2b] px-8 py-6 font-display text-6xl font-semibold tracking-[0.25em] text-[#a3e635] shadow-2xl sm:text-8xl">
          {code ?? "······"}
        </p>
        <p className="mt-10 text-sm text-white/40">
          {message ?? "Aguardando vínculo… esta tela conecta sozinha assim que for vinculada."}
        </p>
      </div>
    </div>
  );
}
