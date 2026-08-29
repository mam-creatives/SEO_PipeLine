# VPS kurulumu — SEO Komuta Merkezi

Bu dizin, aracı bir Linux VPS'te `systemd` zamanlayıcısıyla kendi kendine çalışan
bir hizmete dönüştüren birim dosyalarını içerir. Yerelde elle çalıştırmak
(`npm run research`) hâlâ çalışır — bu kurulum yalnız çoklu müşteri +
zamanlanmış koşu ekler.

## 1. Ön koşullar

**Node.js 22** (yerelde doğrulanan sürüm: v22.19.0). Debian/Ubuntu için:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Chrome** — teknik denetim (Core Web Vitals) için gerekli, `TECH_AUDIT_PROVIDER=lighthouse`
kullanılıyorsa. Kurulamıyorsa (ör. küçük bir VPS'te apt paketi başarısız olursa)
`.env`'e `PAGESPEED_API_KEY` ekleyin — pipeline bunu görünce Chrome'suz PageSpeed
Insights API'sine düşer (`.env.example` bu yolu zaten belgeliyor, kod tarafında
seçim `src/providers/registry.ts`'teki `selectTech`'te).

```bash
# Debian/Ubuntu, Chrome deposu:
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt-get update && sudo apt-get install -y google-chrome-stable
```

## 2. Kurulum

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin seo   # oneshot servis root ÇALIŞTIRMAMALI
sudo -u seo git clone <repo-url> /opt/seo-komuta-merkezi
cd /opt/seo-komuta-merkezi
sudo -u seo npm ci
sudo -u seo cp .env.example .env
sudo -u seo nano .env   # gerçek anahtarları + TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID girin
```

`config/` dizinine her müşteri için bir `*.json` dosyası koyun (`config/project.json`
şablonu yeterli — kopyalayıp `domain`/`seedKeywords`/vb. değiştirin). `npm run research-all`
bu dizini tarar (`src/cli/discoverClients.ts`); bozuk/eksik bir dosya diğerlerini
düşürmez, uyarıyla atlanır.

## 3. systemd birimleri

```bash
sudo cp deploy/seo-pipeline.service deploy/seo-pipeline.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now seo-pipeline.timer
systemctl list-timers seo-pipeline.timer   # bir sonraki tetiklenmeyi doğrular
```

Elle bir kez denemek için (zamanlayıcıyı beklemeden):

```bash
sudo systemctl start seo-pipeline.service
```

## 4. İzleme

```bash
journalctl -u seo-pipeline.service -f          # canlı takip
journalctl -u seo-pipeline.service --since today
cd /opt/seo-komuta-merkezi && npm run status    # tüm müşterilerin son koşu durumu tek tabloda
```

Müşteri başına ayrıntılı log `logs/<tarih>_<slug>.log` altında (stdout/stderr
doğrudan buraya yönlendirilir, `journalctl` yalnız orkestratörün kendi özet
çıktısını taşır).

## 5. Log rotasyonu

Kod tarafında rotasyon YOK (bilinçli — işletim sistemine bırakıldı, YAGNI).
`/etc/logrotate.d/seo-pipeline` örneği:

```
/opt/seo-komuta-merkezi/logs/*.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
}
```

## 6. Bilinen durumlar

- **DataForSEO bakiyesi boş/tükenmiş:** keyword hacmi + backlink dalları 402 ile
  başarısız olur, run yine de `completed` biter (kısmi hata politikası —
  `src/collectors/runAllCollectors.ts`), rapor bu dalların eksik olduğunu açıkça
  gösterir. Bakiye yüklenene kadar araştırma durmaz.
- **Telegram yapılandırılmamışsa:** bildirim sessizce atlanır. Yalnız BİRİ
  verilirse (`TELEGRAM_BOT_TOKEN` ya da `TELEGRAM_CHAT_ID`) pipeline yüksek
  sesle hata verir — ikisini de tamamlayın ya da ikisini de `.env`'den kaldırın.
- **Bildirim yalnız başarısızlıkta gelir:** her koşuda "her şey yolunda" mesajı
  yok — `npm run status` bunu sorulduğunda zaten söylüyor.
