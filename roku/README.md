# Canal Roku MDI 360

Player nativo BrightScript/SceneGraph para mídia, widgets, sincronização e
relatórios de exibição. Roku não executa WebView; widgets possuem renderização
nativa.

## Gerar o pacote

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-roku.ps1
```

O script valida manifest, estrutura e dimensões obrigatórias, então gera
`mdi360-roku.zip` na raiz. O arquivo é ignorado pelo Git e publicado pelo
workflow **Publicar canal Roku**.

## Instalar para teste

1. Ative o modo desenvolvedor na Roku e anote IP, usuário e senha.
2. Abra `http://IP-DA-ROKU`.
3. Envie `mdi360-roku.zip` e instale.
4. Vincule o código em **Studio > Terminais**.
5. Confirme playlist, widgets e **Relatório de Exibição**.

## Imagens obrigatórias

- `icon_focus_fhd.png`: 540 × 405
- `icon_focus_hd.png`: 290 × 218
- `splash_fhd.png`: 1920 × 1080
- `splash_hd.png`: 1280 × 720

O link oferecido ao cliente é definido somente em **Torre > Downloads**.
