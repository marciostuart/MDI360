' One-shot GET of the open-data proxy (/api/public/widget-data).
sub init()
    m.top.functionName = "fetchOnce"
end sub

sub fetchOnce()
    port = CreateObject("roMessagePort")
    transfer = CreateObject("roUrlTransfer")
    transfer.SetMessagePort(port)
    transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    transfer.InitClientCertificates()
    transfer.SetUrl(m.top.url)
    transfer.EnableEncodings(true)

    if not transfer.AsyncGetToString()
        m.top.result = { ok: false }
        return
    end if

    msg = wait(15000, port)
    if type(msg) = "roUrlEvent" and msg.GetResponseCode() = 200
        parsed = ParseJson(msg.GetString())
        if parsed <> invalid
            parsed.ok = true
            m.top.result = parsed
            return
        end if
    else
        transfer.AsyncCancel()
    end if

    m.top.result = { ok: false }
end sub