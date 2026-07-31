' Renders the activation code while unlinked, and the playlist once linked.
' Roku can play images and videos natively; HTML items (web pages and widgets)
' are skipped because Roku has no browser engine.

sub init()
    m.slide = m.top.findNode("slide")
    m.video = m.top.findNode("video")
    m.widget = m.top.findNode("widget")
    m.pairing = m.top.findNode("pairing")
    m.pairingCode = m.top.findNode("pairingCode")
    m.brandLabel = m.top.findNode("brandLabel")
    m.pairingTitle = m.top.findNode("pairingTitle")
    m.statusLabel = m.top.findNode("statusLabel")

    m.items = []
    m.index = -1
    m.revision = -1

    m.slideTimer = CreateObject("roSGNode", "Timer")
    m.slideTimer.repeat = false
    m.slideTimer.observeField("fire", "onSlideTimer")
    m.top.appendChild(m.slideTimer)

    m.video.observeField("state", "onVideoState")

    m.sync = m.top.findNode("sync")
    m.widget.baseUrl = m.sync.baseUrl
    m.statusLabel.text = "Iniciando MDI 360..."
    m.sync.observeField("activationCode", "onActivationCode")
    m.sync.observeField("payload", "onPayload")
    m.sync.observeField("statusText", "onStatusText")
    m.sync.control = "RUN"

    m.top.setFocus(true)
end sub

sub onStatusText()
    m.statusLabel.text = m.sync.statusText
end sub

sub onActivationCode()
    code = m.sync.activationCode
    m.pairingCode.text = code
    if code <> "" then showPairing(true)
end sub

sub showPairing(visible as boolean)
    m.pairing.visible = visible
    if visible
        m.slide.opacity = 0
        m.video.visible = false
        m.video.control = "stop"
        m.widget.visible = false
    end if
end sub

sub onPayload()
    payload = m.sync.payload
    if payload = invalid then return

    ' Global audio switch of this screen. When the TV is muted in the Studio,
    ' every video plays silently no matter what the playlist item asks for.
    m.audioEnabled = true
    if payload.device <> invalid and payload.device.audioEnabled = false then m.audioEnabled = false

    ' Whitelabel: the splash text and brand name come from the customer account.
    if payload.branding <> invalid
        if payload.branding.name <> invalid and payload.branding.name <> "" then m.brandLabel.text = payload.branding.name
        if payload.branding.splashText <> invalid and payload.branding.splashText <> "" then m.pairingTitle.text = payload.branding.splashText
        if payload.branding.color <> invalid and payload.branding.color <> "" then m.widget.brandColor = hexToRokuColor(payload.branding.color)
    end if

    if payload.playlist = invalid or payload.playlist.items = invalid or payload.playlist.items.Count() = 0
        m.items = []
        ' Forget the revision: when the same playlist comes back (unchanged
        ' revision) we must accept it again instead of ignoring it below.
        m.revision = -1
        m.pairingTitle.text = "Aguardando conteudo"
        m.pairingCode.text = ""
        m.statusLabel.text = "Tela vinculada. Publique uma playlist no Studio."
        showPairing(true)
        return
    end if

    if payload.playlist.revision = m.revision then return
    m.revision = payload.playlist.revision

    playable = []
    for each item in payload.playlist.items
        kind = item.kind
        if kind = "widget"
            ' Widgets are drawn natively by WidgetView — no browser needed.
            playable.push(item)
        else if (kind = "image" or kind = "video") and item.url <> invalid and item.url <> ""
            playable.push(item)
        end if
    end for

    m.items = playable
    m.index = -1
    if m.items.Count() > 0
        showPairing(false)
        playNext()
    end if
end sub

sub playNext()
    if m.items.Count() = 0 then return
    m.index = (m.index + 1) mod m.items.Count()
    item = m.items[m.index]

    if item.kind = "widget"
        m.video.control = "stop"
        m.video.visible = false
        m.slide.opacity = 0
        m.widget.item = {
            widgetType: item.widgetType,
            widgetConfig: item.widgetConfig,
            name: item.name,
        }
        m.widget.visible = true
        duration = 15000
        if item.durationMs <> invalid and item.durationMs > 1000 then duration = item.durationMs
        m.slideTimer.duration = duration / 1000.0
        m.slideTimer.control = "start"
    else if item.kind = "video"
        ' A single-video playlist replays the same node, so reset the player
        ' before loading the content again — otherwise it stays on "finished".
        m.video.control = "stop"
        content = CreateObject("roSGNode", "ContentNode")
        content.url = item.url
        content.streamformat = streamFormatFor(item.url)
        content.title = item.name
        m.video.content = content
        m.video.mute = (item.isMuted = true) or (m.audioEnabled = false)
        m.slide.opacity = 0
        m.widget.visible = false
        m.video.visible = true
        m.video.control = "play"
    else
        m.video.control = "stop"
        m.video.visible = false
        m.widget.visible = false
        m.slide.uri = item.url
        m.slide.opacity = 1
        duration = 10000
        if item.durationMs <> invalid and item.durationMs > 1000 then duration = item.durationMs
        m.slideTimer.duration = duration / 1000.0
        m.slideTimer.control = "start"
    end if
end sub

sub onSlideTimer()
    playNext()
end sub

sub onVideoState()
    state = m.video.state
    if state = "finished" or state = "error" then playNext()
end sub

' Roku needs the container format up front; our library stores MP4/WebM/HLS.
function streamFormatFor(url as string) as string
    lower = LCase(url)
    if Instr(1, lower, ".m3u8") > 0 then return "hls"
    if Instr(1, lower, ".webm") > 0 then return "mp4"
    if Instr(1, lower, ".mov") > 0 then return "mp4"
    return "mp4"
end function

' "#3B82F6" -> "0x3B82F6FF"
function hexToRokuColor(hex as string) as string
    clean = hex
    if Left(clean, 1) = "#" then clean = Mid(clean, 2)
    if Len(clean) <> 6 then return "0x3B82F6FF"
    return "0x" + UCase(clean) + "FF"
end function

' Signage screens ignore the remote, except for the back button on the root scene.
function onKeyEvent(key as string, press as boolean) as boolean
    return press
end function