# Links do site institucional

Em **Torre → Site → Site institucional → Links de todos os botões e menus**,
cada ação tem um destino e um seletor **Na mesma aba / Em nova aba**.
As alterações só entram no ar ao clicar em **Salvar site**.

São 14 destinos independentes: logo, cinco menus, entrar/criar conta no
cabeçalho, dois botões principais, diagnóstico, parceria e dois botões finais.
Os cinco links repetidos no menu móvel usam as mesmas configurações do desktop.
Abrir/fechar o menu e expandir o FAQ continuam sendo controles locais, sem URL.

Aceita HTTP(S), caminhos `/...`, âncoras `#...`, `mailto:` e `tel:`. Bloqueia
protocolos executáveis, URLs ambíguas e caracteres de controle. Nova aba usa
`noopener noreferrer`. Sites salvos antes desta atualização mantêm seus links,
inclusive o WhatsApp personalizado. Os dois contatos agora podem ser diferentes;
o campo global antigo não é mais exibido como um controle concorrente.

Persistência no JSON de `platform_settings/landing`, sem migração ou APK novo.
