' Native rendering of the information widgets. Roku has no browser, so instead
' of a WebView we draw the same widgets with SceneGraph labels and fetch the
' data from the very same open-data proxy the web player uses.

sub init()
    m.bg = m.top.findNode("bg")
    m.accent = m.top.findNode("accent")
    m.title = m.top.findNode("title")
    m.hero = m.top.findNode("hero")
    m.sub = m.top.findNode("sub")
    m.lines = m.top.findNode("lines")
    m.credit = m.top.findNode("credit")
    m.data = m.top.findNode("data")

    m.data.observeField("result", "onData")
    m.top.observeField("item", "onItem")
    m.top.observeField("brandColor", "onBrandColor")

    m.clockTimer = CreateObject("roSGNode", "Timer")
    m.clockTimer.repeat = true
    m.clockTimer.duration = 1
    m.clockTimer.observeField("fire", "onClockTick")
    m.top.appendChild(m.clockTimer)

    m.config = {}
    m.kind = ""
end sub

sub onBrandColor()
    color = m.top.brandColor
    if color <> "" then m.accent.color = color
end sub

function cfgString(key as string, fallback as string) as string
    if m.config <> invalid and m.config[key] <> invalid then return m.config[key].ToStr()
    return fallback
end function

sub onItem()
    item = m.top.item
    m.clockTimer.control = "stop"
    m.hero.text = ""
    m.sub.text = ""
    m.lines.text = ""
    m.credit.text = ""

    if item = invalid or item.widgetType = invalid then return
    m.kind = item.widgetType
    if item.widgetConfig <> invalid then m.config = item.widgetConfig else m.config = {}

    if m.kind = "clock"
        m.title.text = "Agora"
        m.clockTimer.control = "start"
        onClockTick()
        return
    end if

    m.title.text = item.name
    m.hero.text = ""
    m.sub.text = "Carregando..."

    url = ""
    if m.kind = "weather"
        url = m.top.baseUrl + "/api/public/widget-data?type=weather&cityId=" + cfgString("cityId", "belo-horizonte")
    else if m.kind = "currency"
        pairs = "USD-BRL"
        if m.config.pairs <> invalid and type(m.config.pairs) = "roArray"
            joined = ""
            for each pair in m.config.pairs
                if joined <> "" then joined = joined + ","
                joined = joined + pair
            end for
            if joined <> "" then pairs = joined
        end if
        url = m.top.baseUrl + "/api/public/widget-data?type=currency&pairs=" + pairs
    else if m.kind = "news"
        url = m.top.baseUrl + "/api/public/widget-data?type=news&feedId=" + cfgString("feedId", "agencia-brasil")
    else
        m.sub.text = ""
        return
    end if

    m.data.control = "stop"
    m.data.url = url
    m.data.control = "RUN"
end sub

' ---------- clock ----------

sub onClockTick()
    now = CreateObject("roDateTime")
    now.ToLocalTime()
    hours = now.GetHours()
    minutes = now.GetMinutes()
    text = pad2(hours) + ":" + pad2(minutes)
    if m.config.showSeconds = true then text = text + ":" + pad2(now.GetSeconds())
    m.hero.text = text

    if m.config.showDate = false
        m.sub.text = ""
    else
        weekdays = ["domingo", "segunda-feira", "terca-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sabado"]
        months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
        m.sub.text = weekdays[now.GetDayOfWeek()] + ", " + now.GetDayOfMonth().ToStr() + " de " + months[now.GetMonth() - 1] + " de " + now.GetYear().ToStr()
    end if
end sub

function pad2(value as integer) as string
    if value < 10 then return "0" + value.ToStr()
    return value.ToStr()
end function

' ---------- remote data ----------

function money(value as double) as string
    ' Brazilian format: thousands with dot, two decimals with comma.
    cents = Int(value * 100 + 0.5)
    whole = Int(cents / 100)
    frac = cents - whole * 100
    digits = whole.ToStr()
    grouped = ""
    count = 0
    for i = Len(digits) to 1 step -1
        grouped = Mid(digits, i, 1) + grouped
        count = count + 1
        if count mod 3 = 0 and i > 1 then grouped = "." + grouped
    end for
    return grouped + "," + pad2(frac)
end function

function weatherText(code as integer) as string
    if code = 0 then return "Ceu limpo"
    if code <= 2 then return "Parcialmente nublado"
    if code = 3 then return "Nublado"
    if code <= 48 then return "Neblina"
    if code <= 57 then return "Garoa"
    if code <= 67 then return "Chuva"
    if code <= 77 then return "Neve"
    if code <= 82 then return "Pancadas de chuva"
    if code <= 99 then return "Tempestade"
    return ""
end function

sub onData()
    result = m.data.result
    if result = invalid or result.ok <> true
        m.sub.text = "Dados indisponiveis no momento."
        return
    end if

    if m.kind = "weather"
        m.title.text = result.city
        temp = 0
        if result.current <> invalid and result.current.temperature <> invalid then temp = Int(result.current.temperature + 0.5)
        m.hero.text = temp.ToStr() + Chr(176) + "C"
        descr = ""
        if result.current <> invalid and result.current.code <> invalid then descr = weatherText(Int(result.current.code))
        if result.current <> invalid and result.current.humidity <> invalid
            descr = descr + "   ·   Umidade " + Int(result.current.humidity).ToStr() + "%"
        end if
        m.sub.text = descr

        forecast = ""
        if result.daily <> invalid
            for each day in result.daily
                if day.max <> invalid and day.min <> invalid
                    label = Mid(day.date, 9, 2) + "/" + Mid(day.date, 6, 2)
                    forecast = forecast + label + "   " + Int(day.min + 0.5).ToStr() + Chr(176) + " / " + Int(day.max + 0.5).ToStr() + Chr(176) + "C" + Chr(10)
                end if
            end for
        end if
        m.lines.text = forecast
        m.credit.text = result.credit

    else if m.kind = "currency"
        m.title.text = "Cotacoes"
        m.hero.text = ""
        m.sub.text = ""
        text = ""
        if result.quotes <> invalid
            for each quote in result.quotes
                arrow = "="
                if quote.changePct > 0 then arrow = Chr(9650)
                if quote.changePct < 0 then arrow = Chr(9660)
                text = text + quote.name + "   R$ " + money(quote.value) + "   " + arrow + " " + Str(quote.changePct) + "%" + Chr(10)
            end for
        end if
        m.lines.translation = [120, 260]
        m.lines.text = text
        m.credit.text = result.credit

    else if m.kind = "news"
        m.title.text = result.source
        m.hero.text = ""
        m.sub.text = ""
        limit = 5
        if m.config.headlines <> invalid then limit = Int(m.config.headlines)
        text = ""
        index = 0
        if result.headlines <> invalid
            for each headline in result.headlines
                if index >= limit then exit for
                text = text + Chr(8226) + " " + headline + Chr(10)
                index = index + 1
            end for
        end if
        m.lines.translation = [120, 240]
        m.lines.height = 700
        m.lines.text = text
        m.credit.text = result.credit
    end if
end sub