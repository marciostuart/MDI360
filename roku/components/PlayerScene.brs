' Renders the activation code while unlinked, and the playlist once linked.
' Roku can play images and videos natively; HTML items (web pages and widgets)
' are skipped because Roku has no browser engine.

sub init()
    m.slide = m.top.findNode("slide")
    m.video = m.top.findNode("video")
    m.widget = m.top.findNode("widget")
    m.pairing = m.top.findNode("pairing")
    m.pairingCode = m.top.findNode("pairingCode")
    m.cover = m.top.findNode("cover")
    m.fadeAnim = m.top.findNode("fadeAnim")
    m.brandLabel = m.top.findNode("brandLabel")
    m.pairingTitle = m.top.findNode("pairingTitle")
    m.statusLabel = m.top.findNode("statusLabel")

    m.items = []
    ' All playable items of the current playlist, in order, including the ones
    ' still downloading. m.items holds only the ones ready to go on screen.
    m.allItems = []
    m.readyMap = {}
    m.index = -1
    m.revision = -1
    ' Per-TV setting sent by the server: "none" (hard cut) or "fade".
    m.transition = "none"

    m.slideTimer = CreateObject("roSGNode", "Timer")
    m.slideTimer.repeat = false
    m.slideTimer.observeField("fire", "onSlideTimer")
    m.top.appendChild(m.slideTimer)

    m.video.observeField("state", "onVideoState")
    m.video.observeField("position", "onVideoPosition")
    ' The remote is irrelevant on signage, and trick play only wastes memory.
    m.video.enableTrickPlay = false
    m.video.enableUI = false
    m.video.enableCC = false

    ' Stall watchdog: a video that stops advancing (weak Wi-Fi, slow upstream,
    ' heavy bitrate for this Roku) is resumed once and then skipped, so the
    ' playlist never freezes on a single file.
    m.videoPosition = 0
    m.videoStallTicks = 0
    m.videoRetries = 0
    m.stallTimer = CreateObject("roSGNode", "Timer")
    m.stallTimer.repeat = true
    m.stallTimer.duration = 5
    m.stallTimer.observeField("fire", "onStallCheck")
    m.top.appendChild(m.stallTimer)

    m.playlistId = invalid
    ' Payload that arrived mid-exhibition: applied only at the next boundary.
    m.pendingPayload = invalid
    m.resumeAfterApply = false
    m.report = m.top.findNode("report")

    m.prefetch = m.top.findNode("prefetch")
    m.prefetch.observeField("ready", "onPrefetchReady")
    m.prefetch.control = "RUN"

    m.sync = m.top.findNode("sync")
    m.widget.baseUrl = m.sync.baseUrl
    m.statusLabel.text = "Iniciando MDI 360..."
    m.sync.observeField("activationCode", "onActivationCode")
    m.sync.observeField("payload", "onPayload")
    m.sync.observeField("statusText", "onStatusText")
    m.report.baseUrl = m.sync.baseUrl
    m.report.control = "RUN"
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
        if m.fadeAnim <> invalid then m.fadeAnim.control = "stop"
        if m.cover <> invalid then m.cover.opacity = 0
    end if
end sub

sub onPayload()
    payload = m.sync.payload
    if payload = invalid then return

    ' Nothing on screen yet (or playlist emptied): apply right away.
    if m.items.Count() = 0
        applyPayload(payload)
        return
    end if

    ' Playlist gone: stop immediately, that is the expected behaviour.
    if payload.playlist = invalid or payload.playlist.items = invalid or payload.playlist.items.Count() = 0
        m.pendingPayload = invalid
        applyPayload(payload)
        return
    end if

    ' Something is playing: hold the new payload until the current file ends,
    ' so the content is never cut in the middle.
    if changesPlayback(payload)
        m.pendingPayload = payload
    else
        applyPayload(payload)
    end if
end sub

' True when the payload would change what/how the TV plays (playlist revision,
' global audio switch or transition setting).
function changesPlayback(payload as object) as boolean
    if payload.playlist <> invalid and payload.playlist.revision <> m.revision then return true
    if payload.device <> invalid
        audio = true
        if payload.device.audioEnabled = false then audio = false
        if audio <> m.audioEnabled then return true
        if payload.device.transitionEffect <> invalid
            newTransition = "none"
            if payload.device.transitionEffect = "fade" then newTransition = "fade"
            if newTransition <> m.transition then return true
        end if
    end if
    return false
end function

sub applyPayload(payload as object)
    m.pendingPayload = invalid

    ' Global audio switch of this screen. When the TV is muted in the Studio,
    ' every video plays silently no matter what the playlist item asks for.
    m.audioEnabled = true
    if payload.device <> invalid and payload.device.audioEnabled = false then m.audioEnabled = false
    if payload.device <> invalid and payload.device.transitionEffect <> invalid
        if payload.device.transitionEffect = "fade"
            m.transition = "fade"
        else
            m.transition = "none"
        end if
    end if

    ' Whitelabel: the splash text and brand name come from the customer account.
    if payload.branding <> invalid
        if payload.branding.name <> invalid and payload.branding.name <> "" then m.brandLabel.text = payload.branding.name
        if payload.branding.splashText <> invalid and payload.branding.splashText <> "" then m.pairingTitle.text = payload.branding.splashText
        if payload.branding.color <> invalid and payload.branding.color <> "" then m.widget.brandColor = hexToRokuColor(payload.branding.color)
    end if

    if payload.playlist = invalid or payload.playlist.items = invalid or payload.playlist.items.Count() = 0
        m.items = []
        m.allItems = []
        m.readyMap = {}
        if m.prefetch <> invalid then m.prefetch.urls = []
        ' Forget the revision: when the same playlist comes back (unchanged
        ' revision) we must accept it again instead of ignoring it below.
        m.revision = -1
        m.pairingTitle.text = "Aguardando conteudo"
        m.pairingCode.text = ""
        m.statusLabel.text = "Tela vinculada. Publique uma playlist no Studio."
        showPairing(true)
        return
    end if

    m.playlistId = payload.playlist.id
    if payload.playlist.revision = m.revision
        ' Only settings changed: keep the list and just continue playing.
        if m.resumeAfterApply
            m.resumeAfterApply = false
            advanceItem()
        end if
        return
    end if
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

    m.allItems = playable

    ' Ask the prefetch task about the files of this playlist. Anything that is
    ' not confirmed yet stays out of the rotation; the TV keeps playing what it
    ' already has and the file joins its position once it is ready.
    urls = []
    for each item in playable
        if item.kind <> "widget" and item.url <> invalid and item.url <> "" then urls.push(item.url)
    end for
    ' Drop files that left the playlist (deleted in the Studio) from the map,
    ' so they are never shown again and are re-verified if they come back.
    fresh = {}
    for each url in urls
        if m.readyMap[url] = true then fresh[url] = true
    end for
    m.readyMap = fresh
    m.prefetch.ready = fresh
    m.prefetch.urls = urls

    m.items = readyItems()
    m.index = -1
    if m.items.Count() > 0
        showPairing(false)
        playNext()
    else
        m.pairingCode.text = ""
        m.statusLabel.text = "Baixando conteudo para esta tela..."
        showPairing(true)
    end if
end sub

' Items whose file is already confirmed on this TV (widgets need no download).
function readyItems() as object
    result = []
    for each item in m.allItems
        if item.kind = "widget"
            result.push(item)
        else if item.url <> invalid and m.readyMap[item.url] = true
            result.push(item)
        end if
    end for
    return result
end function

' A file finished downloading/became available: it enters the rotation in its
' own playlist position, without interrupting whatever is on screen.
sub onPrefetchReady()
    ready = m.prefetch.ready
    if ready = invalid then return
    m.readyMap = ready

    currentId = invalid
    if m.index >= 0 and m.index < m.items.Count() then currentId = m.items[m.index].id

    m.items = readyItems()

    ' Keep pointing at the item currently on screen so the new file only shows
    ' up when its turn comes.
    if currentId <> invalid
        for i = 0 to m.items.Count() - 1
            if m.items[i].id = currentId
                m.index = i
                return
            end if
        end for
        m.index = -1
        return
    end if

    if m.items.Count() > 0 and m.index < 0
        showPairing(false)
        playNext()
    end if
end sub

sub playNext()
    ' A newer playlist / settings payload waited for this exact moment.
    if m.pendingPayload <> invalid
        pending = m.pendingPayload
        m.pendingPayload = invalid
        m.resumeAfterApply = true
        applyPayload(pending)
        m.resumeAfterApply = false
        return
    end if
    advanceItem()
end sub

sub advanceItem()
    if m.items.Count() = 0 then return
    m.index = (m.index + 1) mod m.items.Count()
    item = m.items[m.index]

    ' Tell the server what went on screen (playback reports / live view).
    if m.report <> invalid
        m.report.report = {
            playlistId: m.playlistId,
            mediaAssetId: item.mediaAssetId,
            durationMs: item.durationMs
        }
    end if

    if item.kind <> "video" and m.stallTimer <> invalid then m.stallTimer.control = "stop"

    ' Blackout before swapping: hides the Video node's file name/spinner and
    ' gives the fade something to fade from.
    if m.fadeAnim <> invalid then m.fadeAnim.control = "stop"
    if item.kind = "video" or m.transition = "fade"
        m.cover.opacity = 1
    else
        m.cover.opacity = 0
    end if

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
        revealContent()
    else if item.kind = "video"
        ' A single-video playlist replays the same node, so reset the player
        ' before loading the content again — otherwise it stays on "finished".
        m.video.control = "stop"
        content = CreateObject("roSGNode", "ContentNode")
        content.url = item.url
        content.streamformat = streamFormatFor(item.url)
        ' No title / no description: Roku would flash the file name on screen.
        content.title = ""
        m.video.content = content
        content.StreamBitrate = 0
        content.StreamQualities = ["HD"]
        content.StreamContentIDs = [item.id]
        m.video.mute = (item.isMuted = true) or (m.audioEnabled = false)
        m.slide.opacity = 0
        m.widget.visible = false
        m.video.visible = true
        m.videoPosition = 0
        m.videoStallTicks = 0
        m.video.control = "play"
        m.stallTimer.control = "start"
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
        revealContent()
    end if
end sub

' Removes the black curtain — instantly, or with a soft fade when the customer
' enabled the transition for this TV.
sub revealContent()
    if m.cover = invalid then return
    if m.transition = "fade" and m.fadeAnim <> invalid
        m.cover.opacity = 1
        m.fadeAnim.control = "start"
    else
        m.cover.opacity = 0
    end if
end sub

sub onSlideTimer()
    playNext()
end sub

sub onVideoPosition()
    ' Any forward movement means the stream is healthy again.
    if m.video.position > m.videoPosition
        m.videoPosition = m.video.position
        m.videoStallTicks = 0
    end if
end sub

' Runs every 5s while a video is on screen.
sub onStallCheck()
    state = m.video.state
    if state <> "playing" and state <> "buffering" then return

    m.videoStallTicks = m.videoStallTicks + 1
    ' 4 ticks = ~20s with no progress at all.
    if m.videoStallTicks < 4 then return

    m.videoStallTicks = 0
    if m.videoRetries < 1
        ' One resume attempt from where it stopped before giving up.
        m.videoRetries = m.videoRetries + 1
        m.statusLabel.text = "Rede lenta: retomando o video..."
        resume = m.videoPosition
        m.video.control = "stop"
        m.video.seek = resume
        m.video.control = "play"
    else
        m.videoRetries = 0
        m.stallTimer.control = "stop"
        playNext()
    end if
end sub

sub onVideoState()
    state = m.video.state
    if state = "playing"
        m.videoRetries = 0
        ' Only now the first frame is on screen: safe to lift the curtain.
        revealContent()
    end if
    if state = "finished" or state = "error"
        if m.stallTimer <> invalid then m.stallTimer.control = "stop"
        m.videoRetries = 0
        playNext()
    end if
end sub

' Roku needs the container format up front; our library stores MP4/WebM/HLS.
function streamFormatFor(url as string) as string
    lower = LCase(url)
    if Instr(1, lower, ".m3u8") > 0 then return "hls"
    if Instr(1, lower, ".mpd") > 0 then return "dash"
    if Instr(1, lower, ".mkv") > 0 then return "mkv"
    if Instr(1, lower, ".ts") > 0 then return "ts"
    ' MOV/WebM containers are read by Roku's MP4 demuxer when the video track
    ' is H.264/H.265, which is what our library produces.
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