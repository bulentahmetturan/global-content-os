import json
import sys
from pathlib import Path

# adapters/hekimler-radar/scripts/ -> adapters/hekimler-radar/ (no machine-specific absolute paths)
RADAR_ROOT = Path(__file__).resolve().parents[1]

d = json.loads(
    (RADAR_ROOT / "content" / "archive" / "_source_list_audit.json").read_text(encoding="utf-8")
)
rows = [{k: r[k] for k in ("category", "id", "name", "verdict", "why")} for r in d["rows"]]
for r in rows:
    r["name"] = r["name"].replace(" -- ", " — ")

header = r'''import { Button, Callout, Divider, Grid, H1, H2, H3, Pill, Row, Spacer, Stack, Stat, Table, Text, useCanvasState } from "cursor/canvas";

type Row = { category: string; id: string; name: string; verdict: string; why: string };

'''

mid = """
const CATS = ["all", "haber", "research", "duyuru", "burs", "egitim"] as const;
const VERDICTS = ["all", "FAIL", "HUMAN_REQUIRED", "PASS"] as const;
const CAT_LABEL: Record<string, string> = {
  all: "Tümü",
  haber: "Haber",
  research: "Research",
  duyuru: "Duyuru",
  burs: "Burs",
  egitim: "Eğitim",
};

function rowTone(v: string): "success" | "danger" | "warning" | undefined {
  if (v === "PASS") return "success";
  if (v === "FAIL") return "danger";
  if (v === "HUMAN_REQUIRED") return "warning";
  return undefined;
}

export default function SourceListAudit() {
  const [cat, setCat] = useCanvasState<(typeof CATS)[number]>("cat", "all");
  const [verdict, setVerdict] = useCanvasState<(typeof VERDICTS)[number]>("verdict", "FAIL");
  const filtered = ROWS.filter(
    (r) => (cat === "all" || r.category === cat) && (verdict === "all" || r.verdict === verdict)
  );
  const fails = ROWS.filter((r) => r.verdict === "FAIL");

  return (
    <Stack gap={20}>
      <Stack gap={6}>
        <H1>Beş kategori kaynak listesi — PASS / FAIL</H1>
        <Text tone="secondary">24 Eyl 2026 21:00 UTC · canlı Hub feed telemetrisi + registry + URL probe · Bible v3</Text>
      </Stack>

      <Callout tone="warning" title="Bible'de ikili kaynak-listesi PASS/FAIL yok">
        Bible v3 kaynak kataloğu için binary geç/kal şartı tanımlamaz. Var olan: §7.1 on iki doğrulama sorusu;
        §7.3/§19 source_state (candidate → verified → active → degraded / manual_only / paused / retired / denylisted);
        §7.4 teknik çekim yok = red değil (manual_only); §8.2 anti-bot bypass yok; §34 "değerli ama fetch yok → MANUAL_ONLY".
        Envelope PASS|FAIL|UNKNOWN|HUMAN_REQUIRED işlem içindir, kaynak listesi için değil. Bu rapordaki PASS/FAIL türetilmiş
        rubriktir; kalıcı kuralı birlikte Bible/Config'e yazacağız.
      </Callout>

      <Callout tone="info" title="Bu denetimin türetilmiş rubriği">
        PASS = doğru kategoride kayıtlı ve (otomatik çekim hatasız) veya (MANUAL_INTAKE + resmi URL açık).
        FAIL = ölü URL / 404 / extract sıfır / FAILED_INTERNAL / Hub-registry sapması.
        HUMAN_REQUIRED = 403, challenge, geo-runner, kısmi kapsam — Bible 7.4 ve 8.2 bunu FAIL saymayı yasaklar.
      </Callout>

      <H2>Özet</H2>
      <Grid columns={5} gap={12}>
        {(["haber", "research", "duyuru", "burs", "egitim"] as const).map((c) => (
          <Stat
            key={c}
            label={CAT_LABEL[c]}
            value={`${SUMMARY[c].PASS}/${SUMMARY[c].n} PASS`}
            tone={SUMMARY[c].FAIL ? "danger" : "success"}
          />
        ))}
      </Grid>
      <Text tone="secondary" size="small">
        Toplam 295 kaynak. FAIL 13 · HUMAN_REQUIRED 28 · PASS 254. Burs/Eğitim gelen kutusu boş kalması beklenen:
        MANUAL_INTAKE, çekim kapalı.
      </Text>

      <Callout tone="danger" title="Hub liste sızıntısı (ekran görüntülerin)">
        Haber açıkken Eğitim kataloğu, Eğitim açıkken Burs kataloğu, Burs'ta Duyuru sayaçları. Neden: hekLane Kaduse
        rotasında da kaynak panelini yönetiyordu. Düzeltildi, canlı deploy ad2ddfe6. Hard refresh sonrası her kategori
        kendi listesini göstermeli.
      </Callout>

      <H2>FAIL — 13 kaynak, isim isim</H2>
      <Table
        headers={["Kategori", "Kaynak", "Neden"]}
        striped
        stickyHeader
        rowTone={fails.map(() => "danger" as const)}
        rows={fails.map((r) => [CAT_LABEL[r.category], r.name, r.why])}
      />

      <Divider />
      <H2>Tam liste</H2>
      <Row gap={8} wrap>
        {CATS.map((c) => (
          <Button key={c} size="sm" variant={cat === c ? "primary" : "secondary"} onClick={() => setCat(c)}>
            {CAT_LABEL[c]}
          </Button>
        ))}
      </Row>
      <Row gap={8} wrap>
        {VERDICTS.map((v) => (
          <Button key={v} size="sm" variant={verdict === v ? "primary" : "secondary"} onClick={() => setVerdict(v)}>
            {v === "all" ? "Her verdict" : v}
          </Button>
        ))}
      </Row>
      <Text tone="secondary" size="small">{filtered.length} satır</Text>
      <Table
        headers={["Kategori", "Kaynak", "Verdict", "Neden"]}
        striped
        stickyHeader
        rowTone={filtered.map((r) => rowTone(r.verdict))}
        rows={filtered.map((r) => [
          CAT_LABEL[r.category],
          r.name,
          <Pill key={r.id} tone={r.verdict === "PASS" ? "success" : r.verdict === "FAIL" ? "deleted" : "warning"} size="sm">
            {r.verdict}
          </Pill>,
          r.why,
        ])}
      />
      <Spacer height={12} />
      <H3>Bible'e eklenecek aday kural (şimdi yazılmadı)</H3>
      <Text>
        Source List Gate: her primary category için registry ∩ Hub katalog ∩ worker ID listesi eşit olmalı; URL 404 = FAIL;
        anti-bot/geo = HUMAN_REQUIRED (active kalamaz, denylist olmaz); MANUAL_INTAKE değerli kaynak FAIL değildir. Bunu
        birlikte onaylayınca Bible/Config'e işleriz.
      </Text>
    </Stack>
  );
}
"""

body = (
    header
    + "const SUMMARY = "
    + json.dumps(d["summary"], ensure_ascii=False)
    + " as const;\nconst ROWS: Row[] = "
    + json.dumps(rows, ensure_ascii=False)
    + ";\n"
    + mid
)

# Optional first argument: output path (e.g. an editor canvases directory). Default stays in the repo.
out = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else RADAR_ROOT / "content" / "archive" / "five-category-source-audit.canvas.tsx"
)
out.write_text(body, encoding="utf-8")
print("wrote", out, out.stat().st_size)
