import { Menu, MonitorPlay, X } from "lucide-react";
import { useState } from "react";

import {
  landingAnchorPropsForPage,
  type LandingLinkId,
  type LandingLinks,
} from "@/lib/landing/landing-links";

function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-[#a3ff3f] text-[#07100b]">
        <MonitorPlay className="size-5" />
      </span>
      <span className="font-display text-lg font-bold tracking-tight">MDI 360</span>
    </span>
  );
}

/** Shared institutional header. Saved destinations and targets apply on every public page. */
export function SiteHeader({ links, isHome = false }: { links: LandingLinks; isHome?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const link = (id: LandingLinkId) => {
    return { ...landingAnchorPropsForPage(links[id], isHome), "data-landing-link": id };
  };
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#070a08]/75 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-5 lg:px-10">
        <a {...link("brand")} aria-label="MDI 360 - início">
          <Brand />
        </a>
        <nav className="hidden items-center gap-7 text-sm text-white/65 lg:flex">
          <a {...link("navPlatform")} className="hover:text-white">
            Plataforma
          </a>
          <a {...link("navFeatures")} className="hover:text-white">
            Diferenciais
          </a>
          <a {...link("navAudiences")} className="hover:text-white">
            Para quem
          </a>
          <a {...link("navPartners")} className="hover:text-white">
            Revendas
          </a>
          <a {...link("navFaq")} className="hover:text-white">
            FAQ
          </a>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <a
            {...link("headerLogin")}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Entrar
          </a>
          <a
            {...link("headerSignup")}
            className="rounded-full bg-[#a3ff3f] px-5 py-2.5 text-sm font-bold text-[#07100b] transition hover:scale-[1.03] hover:bg-[#b7ff68]"
          >
            Criar conta
          </a>
        </div>
        <button
          className="grid size-10 place-items-center rounded-full border border-white/15 lg:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </div>
      {menuOpen ? (
        <div className="border-t border-white/10 bg-[#070a08] p-5 lg:hidden">
          <div className="flex flex-col gap-4 text-lg">
            <a {...link("navPlatform")} onClick={() => setMenuOpen(false)}>
              Plataforma
            </a>
            <a {...link("navFeatures")} onClick={() => setMenuOpen(false)}>
              Diferenciais
            </a>
            <a {...link("navPartners")} onClick={() => setMenuOpen(false)}>
              Revendas
            </a>
            <a {...link("headerLogin")} onClick={() => setMenuOpen(false)}>
              Entrar
            </a>
            <a
              {...link("headerSignup")}
              onClick={() => setMenuOpen(false)}
              className="rounded-xl bg-[#a3ff3f] px-4 py-3 text-center font-bold text-black"
            >
              Criar conta
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="px-5 py-10 lg:px-10">
      <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-6 border-t border-white/10 pt-8 text-sm text-white/40 md:flex-row">
        <Brand />
        <p>© {new Date().getFullYear()} Márcio Stuart · 360BH · Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
