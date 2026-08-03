#!/bin/bash
# Script de instalacao automatica para Linux Mint / Ubuntu
APP_DIR="$HOME/.mdi360-emissor"
mkdir -p "$APP_DIR"
cp -r . "$APP_DIR/"

# Criar entrada de auto-inicializacao
AUTOSTART_DIR="$HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"
cat << 'EOT' > "$AUTOSTART_DIR/mdi360-emissor.desktop"
[Desktop Entry]
Type=Application
Exec=$HOME/.mdi360-emissor/node_modules/.bin/electron $HOME/.mdi360-emissor
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name[pt_BR]=MDI360 Emissor
Name=MDI360 Emissor
Comment[pt_BR]=Servico impressor de senhas MDI 360
Comment=Servico impressor de senhas MDI 360
EOT

chmod +x "$AUTOSTART_DIR/mdi360-emissor.desktop"
echo "Instalacao concluida. O programa iniciara automaticamente ao ligar o computador."
