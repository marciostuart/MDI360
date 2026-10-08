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
    m.fadeOutAnim = m.top.findNode("fadeOutAnim")
    ' Fecha a cortina nos ultimos 0,6s do arquivo e so entao troca o conteudo.
    m.fadingOut = false
    m.fadeOutTimer = CreateObject("roSGNode", "Timer")
    m.fadeOutTimer.repeat = false
    m.fadeOutTimer.duration = 0.6
    m.fadeOutTimer.observeField("fire", "onFadeOutDone")
    m.top.appendChild(m.fadeOutTimer)
    m.brandLabel = m.top.findNode("brandLabel")
    m.pairingTitle = m.top.findNode("pairingTitle")
    m.statusLabel = m.top.findNode("statusLabel")
    m.suspended = m.top.findNode("suspended")

    m.items = []
    ' All playable items of the current playlist, in order, including the ones
    ' still downloading. m.items holds only the ones ready to go on screen.
    m.allItems = []
    m.readyMap = {}
    m.cachePaths = {}
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
    ' Keep signage awake even while an image/widget is visible and the Video
    ' node is hidden. These are Roku's supported SceneGraph controls for
    ' suppressing the screen saver during continuous exhibition.
    m.video.disableScreenSaver = true
    m.video.enableScreenSaverWhilePlaying = false

    ' Stall watchdog: a video that stops advancing (weak Wi-Fi, slow upstream,
    ' heavy bitrate for this Roku) is resumed once and then skipped, so the
    ' playlist never freezes on a single file.
    m.videoPosition = 0
    m.videoStallTicks = 0
    m.videoRetries = 0
    m.currentKind = ""
    m.itemDeadline = 0
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

    ' Add-on de senhas: chamada em tela cheia com sinal sonoro e locucao.
    m.queue = m.top.findNode("queue")
    m.queueLabel = m.top.findNode("queueLabel")
    m.queueSector = m.top.findNode("queueSector")
    m.queueHistory = m.top.findNode("queueHistory")
    m.queueHistoryTitle = m.top.findNode("queueHistoryTitle")
    m.queueTitle = m.top.findNode("queueTitle")
    m.queueBg = m.top.findNode("queueBg")
    m.queueBgImage = m.top.findNode("queueBgImage")
    m.chime = m.top.findNode("chime")
    ' O Roku reproduz apenas UM Audio node por vez: sinal sonoro e locucao
    ' compartilham o mesmo no, em sequencia (dois nos travavam o canal).
    m.announce = m.chime
    m.chimePlaying = false
    m.announceStarted = false
    m.seenCalls = {}
    ' Chamadas aguardando a vez: uma chamada nunca corta a anterior.
    m.pendingCalls = []
    m.pendingAnnounceUrl = ""
    ' Texto falado da chamada atual: usado no plano B de locucao.
    m.pendingSpokenText = ""
    m.announceFallbackUsed = false
    m.queueActive = false
    m.queueTimer = CreateObject("roSGNode", "Timer")
    m.queueTimer.repeat = false
    m.queueTimer.observeField("fire", "onQueueTimer")
    m.top.appendChild(m.queueTimer)

    ' A locucao entra depois do sinal sonoro, para nao se sobrepor a ele.
    m.announceTimer = CreateObject("roSGNode", "Timer")
    m.announceTimer.repeat = false
    ' Rede de seguranca: se o fim do sinal sonoro nao for sinalizado, a voz
    ' entra por tempo (o sinal dura 2,1s).
    m.announceTimer.duration = 2.6
    m.announceTimer.observeField("fire", "onAnnounceTimer")
    m.top.appendChild(m.announceTimer)
    ' Se o MP3 do servidor falhar, tentamos uma locucao alternativa.
    m.announce.observeField("state", "onAnnounceState")

    m.prefetch = m.top.findNode("prefetch")
    m.prefetch.observeField("ready", "onPrefetchReady")
    m.prefetch.control = "RUN"

    ' Watchdog geral: se nada progredir (video parado, chamada travada, sync
    ' mudo) por mais de 2 minutos, o canal se recupera sozinho.
    m.lastBeat = uptimeSeconds()
    m.queueStartedAt = 0
    m.queueDeadline = 0
    m.recoveries = 0
    m.watchdogTimer = CreateObject("roSGNode", "Timer")
    m.watchdogTimer.repeat = true
    ' Verificacao a cada 5s: uma chamada presa volta ao conteudo rapidamente.
    m.watchdogTimer.duration = 5
    m.watchdogTimer.observeField("fire", "onWatchdog")
    m.top.appendChild(m.watchdogTimer)
    m.watchdogTimer.control = "start"

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

' Relogio em segundos usado pelo watchdog.
function uptimeSeconds() as longinteger
    return CreateObject("roDateTime").AsSeconds()
end function

' Marca que algo progrediu (conteudo trocou, video andou, servidor respondeu).
sub beat()
    m.lastBeat = uptimeSeconds()
end sub

sub onActivationCode()
    code = m.sync.activationCode
    m.pairingCode.text = code
    if code <> "" then showPairing(true)
end sub

sub showPairing(visible as boolean)
    ' A ticket call owns the screen until its timer ends.
    if m.queueActive = true and visible then return
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
    if payload.suspended = true
        m.suspended.visible = true
        m.video.control = "stop"
        m.video.visible = false
        m.slide.visible = false
        m.widget.visible = false
        m.queue.visible = false
        m.pairing.visible = false
        return
    end if
    m.suspended.visible = false

    ' Rede de seguranca: se uma chamada passou do seu tempo (timer perdido),
    ' encerra agora, antes de qualquer outra coisa.
    if m.queueActive = true and m.queueDeadline > 0 and uptimeSeconds() > m.queueDeadline
        onQueueTimer()
    end if

    ' A ticket call never waits for the current file: it takes over the screen
    ' immediately, which is the whole point of the queue add-on.
    handleQueueCall(payload)

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
        if m.prefetch <> invalid then m.prefetch.entries = []
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
        else if kind = "stream" and item.url <> invalid and item.url <> ""
            ' Streaming: nada e baixado. O Roku nao roda o player do YouTube,
            ' entao esses itens ficam de fora; lives/radios com link direto
            ' (HLS, MP4, MP3) tocam normalmente pelo proprio Video node.
            if Instr(1, LCase(item.url), "youtu") = 0
                item.kind = "video"
                item.isLive = true
                playable.push(item)
            end if
        end if
    end for

    m.allItems = playable

    ' Ask the prefetch task about the files of this playlist. Anything that is
    ' not confirmed yet stays out of the rotation; the TV keeps playing what it
    ' already has and the file joins its position once it is ready.
    entries = []
    for each item in playable
        if item.kind <> "widget" and item.isLive <> true and item.url <> invalid and item.url <> "" then
            entries.push({ id: item.id, url: item.url, path: cachePathFor(item) })
        end if
    end for
    ' Drop files that left the playlist from the in-memory readiness map.
    fresh = {}
    for each item in playable
        if m.readyMap[item.id] = true then fresh[item.id] = true
    end for
    m.readyMap = fresh
    m.prefetch.entries = entries
    m.prefetch.ready = fresh
    m.prefetch.paths = m.cachePaths

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
        if item.kind = "widget" or item.isLive = true
            ' Widgets e transmissoes ao vivo nao dependem de download.
            result.push(item)
        else if item.url <> invalid and m.readyMap[item.id] = true and m.cachePaths[item.id] <> invalid
            item.playUrl = m.cachePaths[item.id]
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
    if m.prefetch.paths <> invalid then m.cachePaths = m.prefetch.paths

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

function cachePathFor(item as object) as string
    return "tmp:/mdi360-cache/" + item.id + ".media"
end function

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

' Desconta o tempo do fade de saida do tempo de exibicao, para que o total
' na tela continue sendo o configurado pelo cliente.
function slideSeconds(durationMs as integer) as float
    seconds = durationMs / 1000.0
    if m.transition = "fade" and seconds > 1.5 then seconds = seconds - 0.6
    return seconds
end function

sub advanceItem()
    ' Never draw content over an active ticket call.
    if m.queueActive = true then return
    if m.items.Count() = 0 then return
    cancelFadeOut()
    beat()
    m.index = (m.index + 1) mod m.items.Count()
    item = m.items[m.index]
    m.currentKind = item.kind
    m.itemDeadline = 0

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
        m.slideTimer.duration = slideSeconds(duration)
        m.slideTimer.control = "start"
        m.itemDeadline = uptimeSeconds() + Int(duration / 1000) + 30
        revealContent()
    else if item.kind = "video"
        ' A single-video playlist replays the same node, so reset the player
        ' before loading the content again — otherwise it stays on "finished".
        m.video.control = "stop"
        content = CreateObject("roSGNode", "ContentNode")
        content.url = item.playUrl
        content.streamformat = streamFormatFor(item.url)
        ' No title / no description: Roku would flash the file name on screen.
        content.title = ""
        m.video.content = content
        m.video.mute = (item.isMuted = true) or (m.audioEnabled = false)
        m.slide.opacity = 0
        m.widget.visible = false
        m.video.visible = true
        m.videoPosition = 0
        m.videoStallTicks = 0
        m.video.control = "play"
        m.stallTimer.control = "start"
        ' Uma transmissao ao vivo nunca termina: o tempo configurado no item
        ' e quem decide quando passar para o proximo conteudo.
        if item.isLive = true
            liveDuration = 60000
            if item.durationMs <> invalid and item.durationMs > 1000 then liveDuration = item.durationMs
            m.slideTimer.duration = slideSeconds(liveDuration)
            m.slideTimer.control = "start"
        end if
    else
        m.video.control = "stop"
        m.video.visible = false
        m.widget.visible = false
        m.slide.uri = item.playUrl
        m.slide.opacity = 1
        duration = 10000
        if item.durationMs <> invalid and item.durationMs > 1000 then duration = item.durationMs
        m.slideTimer.duration = slideSeconds(duration)
        m.slideTimer.control = "start"
        m.itemDeadline = uptimeSeconds() + Int(duration / 1000) + 30
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
    if m.transition = "fade"
        beginFadeOut()
    else
        playNext()
    end if
end sub

' Fecha a cortina preta sobre o conteudo atual; a troca ocorre quando ela
' termina, criando o mesmo efeito do inicio tambem no fim da exibicao.
sub beginFadeOut()
    if m.fadingOut = true then return
    if m.cover = invalid or m.fadeOutAnim = invalid
        playNext()
        return
    end if
    m.fadingOut = true
    if m.fadeAnim <> invalid then m.fadeAnim.control = "stop"
    m.cover.opacity = 0
    m.fadeOutAnim.control = "start"
    m.fadeOutTimer.control = "start"
end sub

sub onFadeOutDone()
    m.fadingOut = false
    if m.fadeOutAnim <> invalid then m.fadeOutAnim.control = "stop"
    if m.cover <> invalid then m.cover.opacity = 1
    playNext()
end sub

' Cancela um fade de saida em andamento (chamada de senha, novo payload...).
sub cancelFadeOut()
    m.fadingOut = false
    if m.fadeOutTimer <> invalid then m.fadeOutTimer.control = "stop"
    if m.fadeOutAnim <> invalid then m.fadeOutAnim.control = "stop"
end sub

' ---------------------------------------------------------------- senhas ----

' Enfileira as chamadas recebidas no payload (nunca vistas antes) e inicia a
' primeira se a tela estiver livre. Chamadas em sequencia formam fila.
sub handleQueueCall(payload as object)
    calls = payload.queueCalls
    if calls = invalid or Type(calls) <> "roArray"
        calls = []
        if payload.queueCall <> invalid then calls.push(payload.queueCall)
    end if
    if calls.Count() = 0 then return

    added = false
    for each call in calls
        if call <> invalid and Type(call) = "roAssociativeArray"
            ' O id vira sempre texto: indexar um mapa com numero quebra a thread
            ' de render e a TV congelava com a senha na tela.
            id = safeText(call.id)
            if id <> ""
                if m.seenCalls[id] <> true
                    m.seenCalls[id] = true
                    m.pendingCalls.push(call)
                    added = true
                end if
            end if
        end if
    end for

    if added and m.queueActive <> true then startNextCall()
end sub

' Coloca na tela a proxima chamada da fila (se houver).
sub startNextCall()
    if m.pendingCalls.Count() = 0 then return
    call = m.pendingCalls.Shift()
    if call = invalid or Type(call) <> "roAssociativeArray" then return
    beat()

    ' Tempo de exibicao: sempre um numero entre 5s e 120s. Um valor invalido
    ' (texto, nulo ou absurdo) deixava a senha na tela para sempre.
    seconds = 20
    wanted = safeNumber(call.displaySeconds)
    if wanted >= 10 then seconds = wanted
    if seconds > 120 then seconds = 120

    ' O relogio da chamada comeca ANTES de qualquer outra coisa: mesmo que um
    ' passo abaixo falhe, a tela nunca fica presa na chamada.
    m.queueTimer.control = "stop"
    m.queueTimer.duration = seconds
    m.queueTimer.control = "start"
    m.queueStartedAt = uptimeSeconds()
    m.queueDeadline = m.queueStartedAt + seconds + 10

    ' A tela da chamada sobe ANTES de parar o conteudo: se qualquer passo
    ' seguinte falhar, a TV mostra a senha em vez de ficar preta.
    label = ""
    if call.label <> invalid then label = safeText(call.label)
    if label = "" then label = "--"
    m.queueLabel.text = label
    if call.sectorName <> invalid and safeText(call.sectorName) <> ""
        m.queueSector.text = safeText(call.sectorName)
    else
        m.queueSector.text = ""
    end if
    if m.queue <> invalid then m.queue.visible = true
    m.queueActive = true
    applyQueueTheme(call)

    ' Stop whatever is on screen right now.
    if m.slideTimer <> invalid then m.slideTimer.control = "stop"
    if m.stallTimer <> invalid then m.stallTimer.control = "stop"
    cancelFadeOut()
    m.video.control = "stop"
    m.video.content = invalid
    m.video.visible = false
    m.widget.visible = false
    m.slide.opacity = 0
    m.pairing.visible = false
    if m.cover <> invalid then m.cover.opacity = 0

    showQueueHistory(call)

    ' Prepara a locucao ANTES de tocar o sinal sonoro: o sinal e a voz usam o
    ' mesmo Audio node, entao qualquer "stop" depois do beep() cancelava o tom
    ' bitonal e a chamada ia direto para a voz.
    if m.announceTimer <> invalid then m.announceTimer.control = "stop"
    if m.announce <> invalid then m.announce.control = "stop"
    m.pendingAnnounceUrl = ""
    m.pendingSpokenText = ""
    m.announceFallbackUsed = false
    m.announceStarted = false
    m.pendingSpokenText = safeText(call.spokenText)
    audioPath = safeText(call.audioUrl)
    base = ""
    if m.sync <> invalid then base = safeText(m.sync.baseUrl)
    if audioPath <> "" and base <> ""
        m.pendingAnnounceUrl = base + audioPath
    else if m.pendingSpokenText <> ""
        m.pendingAnnounceUrl = fallbackAnnounceUrl(m.pendingSpokenText)
    end if

    ' Sinal sonoro: tom personalizado do cliente quando houver, senao o MP3
    ' embarcado no canal (o som de sistema do Roku depende de uma preferencia
    ' da TV e por isso nao era confiavel). A locucao entra quando ele terminar
    ' (onAnnounceState) ou pelo timer de seguranca.
    chimeUrl = customChimeUrl(call, base)
    beep(chimeUrl)

    if m.pendingAnnounceUrl <> "" and m.announceTimer <> invalid
        ' Tom personalizado pode ser mais longo que o embarcado: a rede de
        ' seguranca espera mais para nao cortar o audio do cliente.
        if chimeUrl <> ""
            m.announceTimer.duration = 8
        else
            m.announceTimer.duration = 2.6
        end if
        m.announceTimer.control = "start"
    end if
end sub

' Converte qualquer valor do JSON em numero sem risco de erro de tipo.
function safeNumber(value as dynamic) as float
    if value = invalid then return 0
    t = Type(value)
    if t = "roInt" or t = "Integer" or t = "roFloat" or t = "Float" or t = "Double" or t = "roDouble" or t = "LongInteger" or t = "roLongInteger"
        return value
    end if
    if t = "roString" or t = "String" then return Val(value)
    return 0
end function

' Converte qualquer valor do JSON em texto sem risco de erro de tipo (Str()
' com string quebrava a thread de render e travava a TV).
function safeText(value as dynamic) as string
    if value = invalid then return ""
    if Type(value) = "roString" or Type(value) = "String" then return value.Trim()
    if Type(value) = "roInt" or Type(value) = "Integer" then return Str(value).Trim()
    if Type(value) = "roFloat" or Type(value) = "Float" or Type(value) = "Double" or Type(value) = "roDouble" then return Str(value).Trim()
    return ""
end function

' Dois toques curtos antes da locucao. Usa um Audio node com MP3 do pacote:
' Mostra as 3 ultimas senhas chamadas antes desta, com o setor quando houver
' (ex.: "A011 - Caixa 2     A010 - Triagem     A009").
sub showQueueHistory(call as object)
    if m.queueHistory = invalid then return
    parts = []
    if call.history <> invalid and Type(call.history) = "roArray"
        for each item in call.history
            if item <> invalid and Type(item) = "roAssociativeArray"
                label = safeText(item.label)
                if label <> ""
                    sector = safeText(item.sectorName)
                    if sector <> "" then label = label + " - " + sector
                    parts.push(label)
                end if
            else if item <> invalid and safeText(item) <> ""
                parts.push(safeText(item))
            end if
            if parts.Count() >= 3 then exit for
        end for
    end if

    if parts.Count() = 0
        m.queueHistory.text = ""
        m.queueHistory.visible = false
        if m.queueHistoryTitle <> invalid then m.queueHistoryTitle.visible = false
        return
    end if

    text = ""
    for each part in parts
        if text <> "" then text = text + "     "
        text = text + part
    end for
    m.queueHistory.text = text
    m.queueHistory.visible = true
    if m.queueHistoryTitle <> invalid then m.queueHistoryTitle.visible = true
end sub

' Dois toques curtos antes da locucao. Usa um Audio node com MP3 do pacote:
' funciona mesmo quando os efeitos sonoros do Roku estao desligados e nao
' bloqueia a thread de render (o sleep antigo travava a animacao da tela).
' URL do tom de chamada enviado pelo cliente no Studio (mesma origem do
' servidor). Vazio quando o painel usa o tom padrao.
function customChimeUrl(call as object, base as string) as string
    if call = invalid or base = "" then return ""
    sound = call.sound
    if sound = invalid or Type(sound) <> "roAssociativeArray" then return ""
    path = safeText(sound.chimeUrl)
    if path = "" then return ""
    if Left(path, 4) = "http" then return path
    return base + path
end function

' Aparencia da chamada configurada pelo cliente: cor de fundo (ou imagem),
' cor da senha, dos textos e do historico. Valores invalidos caem no padrao.
sub applyQueueTheme(call as object)
    theme = invalid
    if call <> invalid and Type(call.theme) = "roAssociativeArray" then theme = call.theme

    bg = "0x000000FF"
    ticket = "0xFFFFFFFF"
    text = "0x38BDF8FF"
    history = "0xB8B8B8FF"
    image = ""
    if theme <> invalid
        bg = hexColor(safeText(theme.bgColor), bg)
        ticket = hexColor(safeText(theme.ticketColor), ticket)
        text = hexColor(safeText(theme.textColor), text)
        history = hexColor(safeText(theme.historyColor), history)
        image = safeText(theme.bgImageUrl)
    end if

    if m.queueBg <> invalid then m.queueBg.color = bg
    if m.queueBgImage <> invalid
        if image <> ""
            m.queueBgImage.uri = image
            m.queueBgImage.visible = true
        else
            m.queueBgImage.uri = ""
            m.queueBgImage.visible = false
        end if
    end if
    if m.queueLabel <> invalid then m.queueLabel.color = ticket
    if m.queueSector <> invalid then m.queueSector.color = text
    if m.queueTitle <> invalid then m.queueTitle.color = text
    if m.queueHistory <> invalid then m.queueHistory.color = history
    if m.queueHistoryTitle <> invalid then m.queueHistoryTitle.color = history
end sub

' "#38bdf8" -> "0x38BDF8FF". Qualquer valor fora do formato usa o padrao.
function hexColor(value as string, fallbackColor as string) as string
    hex = value
    if hex = "" then return fallbackColor
    if Left(hex, 1) = "#" then hex = Mid(hex, 2)
    if Len(hex) = 3
        hex = Mid(hex, 1, 1) + Mid(hex, 1, 1) + Mid(hex, 2, 1) + Mid(hex, 2, 1) + Mid(hex, 3, 1) + Mid(hex, 3, 1)
    end if
    if Len(hex) = 8 then return "0x" + UCase(hex)
    if Len(hex) <> 6 then return fallbackColor
    valid = true
    allowed = "0123456789ABCDEF"
    upper = UCase(hex)
    for i = 1 to 6
        if Instr(1, allowed, Mid(upper, i, 1)) = 0 then valid = false
    end for
    if not valid then return fallbackColor
    return "0x" + upper + "FF"
end function

sub beep(url = "" as string)
    if m.chime = invalid then return
    content = CreateObject("roSGNode", "ContentNode")
    if url <> ""
        content.url = url
    else
        content.url = "pkg:/audio/chime.mp3"
    end if
    content.streamformat = "mp3"
    m.chime.control = "stop"
    m.chime.content = content
    m.chimePlaying = true
    m.chime.control = "play"
end sub

' Hora da locucao: o sinal sonoro ja terminou. Falada uma unica vez.
sub onAnnounceTimer()
    if m.pendingAnnounceUrl = "" then return
    if m.announceStarted = true then return
    if m.announce = invalid then return
    m.announceStarted = true
    m.chimePlaying = false
    content = CreateObject("roSGNode", "ContentNode")
    content.url = m.pendingAnnounceUrl
    content.streamformat = "mp3"
    m.announce.control = "stop"
    m.announce.content = content
    m.announce.control = "play"
end sub

' Locucao alternativa, direto de um servico publico de voz em pt-BR. Usada
' quando o MP3 do proprio servidor nao esta disponivel, para que a chamada
' nunca fique sem voz.
function fallbackAnnounceUrl(text as string) as string
    encoded = CreateObject("roUrlTransfer").Escape(text)
    return "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=pt-BR&q=" + encoded
end function

' Encadeia sinal sonoro -> locucao e, se o MP3 do servidor falhar, tenta a voz
' alternativa (uma unica vez).
sub onAnnounceState()
    if m.queueActive <> true then return
    if m.announce = invalid then return
    state = safeText(m.announce.state)

    ' Fim do sinal sonoro: a voz entra agora, sem esperar o timer.
    if m.chimePlaying = true and (state = "finished" or state = "error" or state = "stopped")
        m.chimePlaying = false
        onAnnounceTimer()
        return
    end if

    if state <> "error" then return
    if m.announceFallbackUsed = true then return
    if m.pendingSpokenText = "" then return
    m.announceFallbackUsed = true
    m.pendingAnnounceUrl = fallbackAnnounceUrl(m.pendingSpokenText)
    m.announceStarted = false
    onAnnounceTimer()
end sub

' The call is over: show the next one in line, or resume the playlist.
sub onQueueTimer()
    m.queueActive = false
    m.queueStartedAt = 0
    m.queueDeadline = 0
    beat()
    if m.announce <> invalid then m.announce.control = "stop"
    if m.announceTimer <> invalid then m.announceTimer.control = "stop"
    m.pendingAnnounceUrl = ""
    m.pendingSpokenText = ""
    m.announceFallbackUsed = false
    m.announceStarted = false
    m.chimePlaying = false

    if m.pendingCalls.Count() > 0
        startNextCall()
        return
    end if

    if m.queue <> invalid then m.queue.visible = false

    if m.items.Count() > 0
        showPairing(false)
        playNext()
    else
        showPairing(true)
    end if
end sub

sub onVideoPosition()
    ' Any forward movement means the stream is healthy again.
    if m.video.position > m.videoPosition
        m.videoPosition = m.video.position
        m.videoStallTicks = 0
        beat()
    end if

    ' Ultimos 0,6s do video: fecha a cortina e ja troca de item no fim do fade.
    if m.transition = "fade" and m.queueActive <> true and m.fadingOut <> true
        total = m.video.duration
        if total <> invalid and total > 2 and (total - m.video.position) <= 0.7
            if m.stallTimer <> invalid then m.stallTimer.control = "stop"
            beginFadeOut()
        end if
    end if
end sub

' ------------------------------------------------------------- watchdog ----

' Roda a cada 15s. Duas redes de protecao:
' 1) chamada de senha que passou do seu tempo -> encerra e volta ao conteudo;
' 2) nada progrediu por mais de 2 minutos -> reinicializa o canal por completo.
sub onWatchdog()
    now = uptimeSeconds()

    if m.queueActive = true
        ' Sem prazo valido (payload estranho) tambem encerra: nenhuma chamada
        ' pode ficar na tela para sempre.
        if m.queueDeadline <= 0 or now > m.queueDeadline
            onQueueTimer()
            return
        end if
    end if

    ' Um video saudavel move a posicao. Para imagem/widget, o prazo considera
    ' a duracao configurada; uma sincronizacao de rede nao mascara congelamento.
    if m.currentKind <> "video" and m.itemDeadline > 0
        if now <= m.itemDeadline then return
    else if now - m.lastBeat < 120
        return
    end if

    recoverFromFreeze()
end sub

' Pane: devolve o canal ao estado inicial (sem sair do app, para a TV nunca
' voltar para a tela inicial do Roku) e forca uma nova sincronizacao.
sub recoverFromFreeze()
    beat()
    m.recoveries = m.recoveries + 1

    ' 1. Encerra qualquer chamada presa e libera a tela.
    m.queueActive = false
    m.queueDeadline = 0
    m.pendingCalls = []
    m.seenCalls = {}
    if m.queue <> invalid then m.queue.visible = false
    if m.announce <> invalid then m.announce.control = "stop"
    if m.chime <> invalid then m.chime.control = "stop"
    if m.announceTimer <> invalid then m.announceTimer.control = "stop"
    if m.queueTimer <> invalid then m.queueTimer.control = "stop"

    ' 2. Zera o player de video e os temporizadores de conteudo.
    m.slideTimer.control = "stop"
    m.stallTimer.control = "stop"
    m.video.control = "stop"
    m.video.content = invalid
    m.video.visible = false
    m.videoPosition = 0
    m.videoStallTicks = 0
    m.videoRetries = 0
    if m.cover <> invalid then m.cover.opacity = 0

    ' 3. Reinicia as tarefas de rede (sync/prefetch/report podem ter morrido).
    if m.sync <> invalid
        m.sync.control = "stop"
        m.sync.control = "RUN"
    end if
    if m.prefetch <> invalid
        m.prefetch.control = "stop"
        m.prefetch.control = "RUN"
    end if
    if m.report <> invalid
        m.report.control = "stop"
        m.report.control = "RUN"
    end if

    ' 4. Forca a proxima playlist a ser reaplicada e retoma a exibicao.
    m.revision = -1
    m.pendingPayload = invalid
    m.statusLabel.text = "Recuperando exibicao..."
    if m.items.Count() > 0
        showPairing(false)
        m.index = -1
        advanceItem()
    else
        showPairing(true)
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
        beat()
        ' Only now the first frame is on screen: safe to lift the curtain.
        revealContent()
    end if
    if state = "finished" or state = "error"
        if m.stallTimer <> invalid then m.stallTimer.control = "stop"
        m.videoRetries = 0
        beat()
        ' Uma chamada de senha esta no ar: o conteudo retoma quando ela acabar.
        if m.queueActive = true then return
        if m.fadingOut = true then return
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
