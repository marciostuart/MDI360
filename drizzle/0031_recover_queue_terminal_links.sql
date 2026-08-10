-- Recupera filas que ficaram sem terminal durante a transição do modelo 1:1.
-- O nome inicial da fila foi copiado do terminal, portanto esta é a associação
-- mais segura e preserva toda a configuração, operadores e histórico existentes.
INSERT INTO "queue_panel_devices" ("panel_id", "device_id")
SELECT qp."id", d."id"
FROM "queue_panels" qp
INNER JOIN "devices" d
  ON d."organization_id" = qp."organization_id"
 AND LOWER(BTRIM(d."name")) = LOWER(BTRIM(qp."name"))
WHERE NOT EXISTS (
  SELECT 1 FROM "queue_panel_devices" qpd WHERE qpd."panel_id" = qp."id"
)
AND NOT EXISTS (
  SELECT 1 FROM "queue_panel_devices" qpd WHERE qpd."device_id" = d."id"
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Depois das correspondências por nome, associa os pares restantes apenas nas
-- organizações em que a quantidade de filas e terminais livres é idêntica.
WITH orphan_panels AS (
  SELECT
    qp."id",
    qp."organization_id",
    ROW_NUMBER() OVER (PARTITION BY qp."organization_id" ORDER BY qp."created_at", qp."id") AS rn,
    COUNT(*) OVER (PARTITION BY qp."organization_id") AS total
  FROM "queue_panels" qp
  WHERE NOT EXISTS (
    SELECT 1 FROM "queue_panel_devices" qpd WHERE qpd."panel_id" = qp."id"
  )
), free_devices AS (
  SELECT
    d."id",
    d."organization_id",
    ROW_NUMBER() OVER (PARTITION BY d."organization_id" ORDER BY d."created_at", d."id") AS rn,
    COUNT(*) OVER (PARTITION BY d."organization_id") AS total
  FROM "devices" d
  WHERE d."status" <> 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM "queue_panel_devices" qpd WHERE qpd."device_id" = d."id"
    )
)
INSERT INTO "queue_panel_devices" ("panel_id", "device_id")
SELECT p."id", d."id"
FROM orphan_panels p
INNER JOIN free_devices d
  ON d."organization_id" = p."organization_id"
 AND d.rn = p.rn
 AND d.total = p.total
ON CONFLICT DO NOTHING;
