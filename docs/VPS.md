<div dir="rtl">

# التركيب على خادم افتراضي (VPS) — الطريقة المثالية

> دليل تشغيل كامل من خادمٍ فارغ إلى موقع يعمل بـ HTTPS ومهام مجدولة ونسخ احتياطي
> ومراقبة. مكتوب لمن لم يُدِر خادم Linux من قبل: كل أمر مشروح، وكل قرار معلَّل.
>
> **الفرق عن `docs/CPANEL.md`:** هناك تجربة على استضافة مشتركة بحدودها. هنا
> **الطريقة الصحيحة** — تملك الجذر، فتُبنى المنظومة كما ينبغي: خدمة `systemd`
> تُعيد التشغيل تلقائياً، وNginx أمامها، وشهادة تُجدَّد نفسها، ومؤقّتات تحلّ محل
> جدولة Vercel، ونسخ احتياطي مجدول.
>
> وسطر واحد لا أُطيل فيه: قرار تأجيل الدومين والنشر التجاري قائم (`DECISIONS.md`
> ← D-35). هذا الملف يجهّزك ليوم تقرر فيه، أو لخادم تجربة على نطاق فرعي.

---

## ٠) ماذا سنبني بالضبط

```
الإنترنت ─▶ Nginx (٤٤٣ HTTPS)
              │  شهادة Let's Encrypt تُجدَّد تلقائياً
              ▼
         Next.js على 127.0.0.1:3000   ← خدمة systemd باسم tours
              │
              ├─▶ Supabase (القاعدة والتخزين)   — خارج الخادم
              └─▶ مؤقّتان systemd: عامل الإشعارات كل دقيقة · دورة البث كل ٥ دقائق
                                     (يحلّان محل `vercel.json`)
```

**لماذا `systemd` لا `pm2`:** موجود أصلاً في كل توزيعة، يبدأ مع الإقلاع بلا حيلة،
يعيد التشغيل عند الانهيار، ويكتب سجله في `journald` بلا ملفات تتضخم. وpm2 طبقة
إضافية تحتاج هي نفسها إشرافاً.

---

## ١) الخادم — المواصفات الحقيقية لا الدعائية

| البند | الحدّ الأدنى العملي | الموصى به |
|---|---|---|
| الذاكرة | **٢ جيجا** | ٤ جيجا |
| المعالج | نواة واحدة | نواتان |
| القرص | ٢٠ جيجا | ٤٠ جيجا |
| النظام | **Ubuntu 24.04 LTS** | نفسه |

⚠ **الذاكرة هي القيد الحقيقي، وسببها البناء لا التشغيل.** `next build` يلتهم
ذاكرةً بسخاء؛ التشغيل بعده يعيش مرتاحاً في أقل من نصف جيجا. على خادم بجيجا واحدة
سيُقتل البناء برمز `137` — والحل في القسم ٦ (ملف مبادلة) لا بترقية الخادم بالضرورة.

**الموقع الجغرافي:** اختر أقرب منطقة إلى **قاعدة Supabase** لا إلى زوّارك. كل
صفحة تُصيَّر على الخادم تنادي القاعدة عدة مرات، وزمن الذهاب والعودة هناك يُضاعَف؛
أما الزائر فيرى صفحة جاهزة مرة واحدة. قاعدتك في `eu-west-1` (أيرلندا)، فأوروبا
الغربية خيار سليم.

---

## ٢) تجهيز الخادم — قبل أي كود

ادخل بالجذر أول مرة، ثم لا تعد إليه:

```bash
ssh root@<عنوان-الخادم>
apt update && apt upgrade -y
```

### مستخدم مخصّص للتطبيق

**لا يعمل التطبيق بالجذر أبداً.** ثغرةٌ في اعتمادية واحدة تصير سيطرةً كاملة.

```bash
adduser --disabled-password --gecos "" tours
mkdir -p /home/tours/.ssh
cp ~/.ssh/authorized_keys /home/tours/.ssh/
chown -R tours:tours /home/tours/.ssh
chmod 700 /home/tours/.ssh && chmod 600 /home/tours/.ssh/authorized_keys
```

### الجدار الناري

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

**المنفذ ٣٠٠٠ لا يُفتح إطلاقاً** — التطبيق يستمع على `127.0.0.1` وNginx وحده
يصل إليه. من يفتحه يكشف الموقع بلا شهادة وبلا حماية.

### تقسية الدخول والتحديثات

```bash
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload ssh

apt install -y fail2ban unattended-upgrades
systemctl enable --now fail2ban
dpkg-reconfigure -plow unattended-upgrades
```

⚠ **قبل أن تُغلق دخول كلمة المرور، افتح جلسة SSH ثانية وتأكد أنك تدخل بالمفتاح.**
من أغلقها بلا مفتاح عامل فقد خادمه.

---

## ٣) Node و pnpm

**Node ‏٢٠٫٩ فأعلى شرطٌ من Next نفسها** (`engines.node` في حزمتها)، لا تفضيل.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v          # يجب أن يبدأ بـ v22 (أو v20 ≥ 20.9)
corepack enable
```

`corepack` يأتي مع Node ويشغّل **pnpm بالنسخة المثبتة في المشروع** — فلا تختلف
شجرة الاعتماديات عن جهازك.

---

## ٤) سحب المشروع

المستودع **خاص**، فأنشئ **مفتاح نشر (Deploy Key)** — أفضل من توكن شخصي لأنه
مقصور على مستودع واحد وبصلاحية قراءة فقط:

```bash
su - tours
ssh-keygen -t ed25519 -C "vps-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

انسخ المفتاح ← GitHub ← المستودع ← **Settings → Deploy keys → Add** (بلا صلاحية
كتابة). ثم:

```bash
mkdir -p /srv/tours && cd /srv/tours     # نفّذها بالجذر إن لزم ثم: chown -R tours:tours /srv/tours
git clone git@github.com:cBadr/Tourism-Site.git app
cd app && git log --oneline -1
```

---

## ٥) البيئة — أخطر قسم في الملف

```bash
cd /srv/tours/app
cp .env.example .env.local
nano .env.local
chmod 600 .env.local          # لا يقرؤه إلا صاحبه
```

انسخ القيم من جهازك، وانتبه لهذه الستة:

| المتغيّر | القيمة | لماذا هنا تحديداً |
|---|---|---|
| `DATABASE_URL` | **صيغة Session pooler** من Supabase | المضيف المباشر IPv6 فقط. الـ VPS قد يملك IPv6 فيعمل — لكن الـ pooler يعمل في الحالتين. وإن رأيت `ENOTFOUND` فهذا سببه بلا استثناء |
| `SITE_URL` | `https://yourdomain.com` بلا شرطة في آخره | منه تُبنى الروابط القانونية وخريطة الموقع وبطاقات المشاركة |
| `NOTIFY_DISPATCH_KEY` | سرّ تخترعه | بدونه **تُقفل** المهام المجدولة في الإنتاج (تفشل مغلقة عمداً) |
| `LOOKUP_SALT` | سرّ ثانٍ | ملح بصمة «تابع حجزك» — بدونه يسقط على مفتاح الخدمة، وهو يعمل لكن الصريح أنظف |
| `NEXT_PUBLIC_SUPABASE_URL` و`..._ANON_KEY` | كما هي | ⚠ **تُخبز داخل الحزمة وقت البناء**: يجب أن تكون موجودة **قبل** أمر البناء، وإلا خرج موقع لا يعرف قاعدته — وإصلاحه إعادة بناء لا إعادة تشغيل |
| `ALLOW_TEST_PAYMENTS` | **لا تضبطه إطلاقاً** | حارس بوابة الدفع التجريبية. ضبطه على موقع منشور = زرّ «أكّد حجزي مجاناً» يقيّد إيراداً وهمياً ويطلق البث |

ولّد السرّين:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ٦) البناء

```bash
cd /srv/tours/app
pnpm install --frozen-lockfile
pnpm build
```

**إن قُتل البناء** (`Killed` أو الرمز `137`) فالذاكرة نفدت. أضف ملف مبادلة **بالجذر**:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

ثم أعد البناء. المبادلة بطيئة لكنها تُنجح بناءً يقع مرة كل نشر، ولا تؤثر على
التشغيل بعده.

---

## ٧) خدمة systemd

بالجذر، أنشئ `/etc/systemd/system/tours.service`:

```ini
[Unit]
Description=Tours — Next.js
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=tours
Group=tours
WorkingDirectory=/srv/tours/app
EnvironmentFile=/srv/tours/app/.env.local
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
Environment=NODE_OPTIONS=--max-http-header-size=65536
Environment=CI=true
ExecStart=/usr/bin/node /srv/tours/app/node_modules/next/dist/bin/next start -H 127.0.0.1
Restart=always
RestartSec=3

# تقسية: التطبيق لا يحتاج أكثر من مجلده
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/tours/app/.next

[Install]
WantedBy=multi-user.target
```

ثلاثة أسطر تستحق الشرح:

- **`-H 127.0.0.1` في `ExecStart` لا `HOSTNAME`** — تحقق حي 2026-08-14: `next start`
  في هذه النسخة **لا يقرأ `HOSTNAME`** من البيئة، فيستمع على كل الواجهات ويصير
  المنفذ ٣٠٠٠ مكشوفاً بلا شهادة. الوسيط `-H` هو ما يقيّده فعلاً.
- **`ExecStart` ينادي `next` مباشرةً لا `pnpm start`** — و`CI=true` معه. `pnpm`
  يفحص حالة الاعتماديات عند كل تشغيل سكربت **ويطلب تأكيداً** حين يجدها مركَّبة
  بهوية أخرى؛ وبلا طرفية يفشل بـ `runDepsStatusCheck` فتدور الخدمة في حلقة إعادة
  تشغيل. وخدمةٌ لا ينبغي لها أن تعيد تركيب اعتمادياتها عند الإقلاع أصلاً.
- **`NODE_OPTIONS=--max-http-header-size=65536`** — الترويسات الافتراضية أضيق من
  كوكيز الجلسة المتراكمة، والنتيجة خطأ **HTTP 431** يظهر فجأة بعد تصفح طويل. هذا
  السطر هو نفسه الموجود في سكربتَي `dev` و`start` في المشروع، ويُكرَّر هنا لأن
  `systemd` لا يمرّ بسكربتات الصدفة.
- **`ReadWritePaths=/srv/tours/app/.next`** — مع `ProtectSystem=strict` يصير القرص
  كله للقراءة، وNext يحتاج الكتابة في `.next/cache` وقت التشغيل. بدون هذا السطر
  ستعمل الصفحات ويفشل الكاش بصمت.

ثم:

```bash
systemctl daemon-reload
systemctl enable --now tours
systemctl status tours --no-pager
curl -I http://127.0.0.1:3000     # يجب أن يرد 200
```

---

## ٨) Nginx و HTTPS

```bash
apt install -y nginx
```

أنشئ `/etc/nginx/sites-available/tours`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # ترويسات ضخمة: نفس علاج 431 على الطرف الآخر
    large_client_header_buffers 4 64k;

    # الإيصالات حتى ٥ ميجا — والافتراضي مليون واحد يرفضها بـ 413
    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header X-Forwarded-Host  $host;

        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 120s;
    }
}
```

⚠ **و`X-Forwarded-Proto` قيمته `http` لا `$scheme` — وهذا عكس ما تتوقعه.**
تحقق حي 2026-08-14: `proxy.ts` يعيد كتابة `/en/...` داخلياً، وNext يبني وجهة
إعادة الكتابة من البروتوكول المُعلَن في هذه الترويسة بينما يبقى المضيف هو المستمع
الداخلي — فيصير الهدف `https://localhost:3000` والمستمع نصّي، ويموت الطلب بـ
`EPROTO: wrong version number` (‏TLS يكلّم مقبساً بلا TLS). النتيجة: **كل مسار
`/en/...` يرد ٥٠٠** بينما العربية سليمة. وإعلانُ `http` داخلياً لا يضرّ الروابط
القانونية: `getBaseUrl()` يقرأ `SITE_URL` لا الطلب.

**`X-Forwarded-Host` ليس تزييناً:** Server Actions في هذه النسخة من Next تقارن
ترويسة `Origin` بـ `Host` وتُجهض الطلب عند الاختلاف (حماية CSRF مقصودة). وكل
نموذج في اللوحة و«تابع حجزك» يمرّ منها. فإن رأيت «Invalid Server Actions request»
فهذا السطر أو التالي له.

**و`X-Forwarded-For` يحمل عنوان الزائر** — تقرؤه طبقة خانق «تابع حجزك» لتشتق
بصمة مجهولة. بدونه يتشارك كل الزوار دلواً واحداً.

فعّلها واحصل على الشهادة:

```bash
ln -s /etc/nginx/sites-available/tours /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com --agree-tos -m you@example.com --redirect
systemctl list-timers | grep certbot     # التجديد التلقائي مضبوط
```

`certbot` يعدّل ملف Nginx بنفسه ويضيف تحويل ٨٠ ← ٤٤٣.

---

## ٩) المهام المجدولة — مؤقّتات تحلّ محل `vercel.json`

المشروع يجدول مهمتين على Vercel. هنا نبنيهما بـ `systemd` — أدق من `cron` وله
سجل يُقرأ.

`/etc/systemd/system/tours-notify.service`:

```ini
[Unit]
Description=Tours — notifications worker
[Service]
Type=oneshot
EnvironmentFile=/srv/tours/app/.env.local
ExecStart=/usr/bin/curl -fsS -m 30 -H "x-dispatch-key: ${NOTIFY_DISPATCH_KEY}" "https://yourdomain.com/api/notifications/dispatch?run=1"
```

`/etc/systemd/system/tours-notify.timer`:

```ini
[Unit]
Description=Tours — notifications every minute
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s
[Install]
WantedBy=timers.target
```

وللبث، نفس الملفين باسم `tours-dispatch` مع `OnUnitActiveSec=5min` والمسار
`/api/dispatch/tick?run=1`.

```bash
systemctl daemon-reload
systemctl enable --now tours-notify.timer tours-dispatch.timer
systemctl list-timers | grep tours
journalctl -u tours-dispatch.service -n 20 --no-pager
```

> **دورة البث تشغّل أيضاً كنس الطلبات غير المدفوعة** (الدفعة ٢) — فلا مؤقّت ثالث.
> والكنس **مطفأ افتراضياً** حتى تفعّله من `/admin/settings` ← إعدادات الرحلات.

**للتأكد أن الحارس يعمل:** نفّذ الأمر بلا الترويسة — يجب أن يرد `401`. ثم مع
الترويسة — `200` بملخّص. الرد `401` مع الترويسة يعني اختلاف السرّ بين المؤقّت
والبيئة.

---

## ١٠) النسخ الاحتياطي

المشروع يحمل أداته (`pnpm db:backup` — التفصيل في `docs/BACKUP.md`). اربطها بمؤقّت:

`/etc/systemd/system/tours-backup.service`:

```ini
[Unit]
Description=Tours — database backup
[Service]
Type=oneshot
User=tours
WorkingDirectory=/srv/tours/app
EnvironmentFile=/srv/tours/app/.env.local
ExecStart=/usr/bin/env pnpm db:backup
```

`/etc/systemd/system/tours-backup.timer`:

```ini
[Unit]
Description=Tours — nightly backup
[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload && systemctl enable --now tours-backup.timer
systemctl start tours-backup.service && ls -lh /srv/tours/app/backups
```

⚠ **نسخة على الخادم نفسه ليست نسخة احتياطية.** خادمٌ يُحذف تأخذ نسختَه معه.
انقلها إلى مكان آخر — أبسط طريقة `rclone` إلى Google Drive أو OneDrive، أو
`rsync` إلى جهازك. أضف الأمر سطراً ثانياً في `ExecStart` بعد النسخ.

---

## ١١) السجلات والمراقبة

```bash
journalctl -u tours -f                 # سجل حي
journalctl -u tours --since "1 hour ago" -p err
systemctl status tours
```

`journald` يدوّر سجلاته بنفسه — لا ملفات تتضخم. ولتقييد الحجم:

```bash
sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=500M/' /etc/systemd/journald.conf
systemctl restart systemd-journald
```

**مراقبة خارجية بسيطة ومجانية:** أنشئ فحصاً في UptimeRobot على
`https://yourdomain.com` كل ٥ دقائق. الخادم الذي يسقط ليلاً ولا يخبرك أحد يبقى
ساقطاً حتى يشتكي عميل.

---

## ١٢) سكربت النشر

`/srv/tours/app/deploy.sh` (بمستخدم `tours`):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /srv/tours/app

echo "▶ سحب آخر إصدار"
git pull --ff-only origin main

echo "▶ الاعتماديات"
pnpm install --frozen-lockfile

echo "▶ الهجرات"
pnpm db:migrate

echo "▶ البناء"
pnpm build

echo "▶ إعادة التشغيل"
sudo systemctl restart tours
sleep 3
systemctl is-active --quiet tours && echo "✅ يعمل" || { echo "❌ فشل"; journalctl -u tours -n 30 --no-pager; exit 1; }
```

```bash
chmod +x deploy.sh
# اسمح لـ tours بإعادة تشغيل خدمته وحدها بلا كلمة مرور:
echo 'tours ALL=(root) NOPASSWD: /bin/systemctl restart tours' > /etc/sudoers.d/tours
chmod 440 /etc/sudoers.d/tours
```

**ترتيب الخطوات مقصود:** الهجرات **قبل** البناء وقبل إعادة التشغيل — فالكود
الجديد يفترض مخططاً جديداً، والعكس يعني دقائق من الأخطاء.

> **انقطاع قصير عند إعادة التشغيل** (ثانيتان أو ثلاث). لتفاديه تماماً تحتاج
> نسختين خلف Nginx وتبديلاً بينهما — تعقيدٌ لا يستحقه موقع في بدايته. اجعل
> النشر في ساعة هادئة.

---

## ١٣) قبل أن تفتحه لأحد — ستة بنود

1. **البيانات التجريبية.** القاعدة تحمل ستة أشهر محاكاة وحجوزات تجربة. نظّفها
   (`handover/OPEN_TASKS.md` القسم د) أو استعمل مشروع Supabase جديداً للإنتاج.
2. **`ALLOW_TEST_PAYMENTS` غير مضبوط** — تأكد بعينك.
3. **كلمة مرور اللوحة قوية** — الموقع صار على الإنترنت المفتوح.
4. **الأسرار:** `chmod 600 .env.local`، ولا تضعها في أي مستودع.
5. **إن كان الخادم للتجربة لا للإطلاق** فامنع الفهرسة، وإلا نافست نسخةٌ ثانية
   نطاقَك الحقيقي لاحقاً. في كتلة `server` بـ Nginx:
   ```nginx
   add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
   ```
6. **جرّب الاسترجاع مرة واحدة** قبل أن تحتاجه (`docs/BACKUP.md`). نسخةٌ لم
   تُختبَر ليست نسخة.

---

## ١٤) أعطال متوقعة وعلاجها

| العَرَض | السبب | العلاج |
|---|---|---|
| `HTTP 431` | ترويسات كبيرة | `NODE_OPTIONS` في وحدة systemd **و**`large_client_header_buffers` في Nginx |
| `Invalid Server Actions request` عند حفظ أي نموذج | الوكيل يغيّر `Origin` عن `Host` | `proxy_set_header X-Forwarded-Host $host;` — وإن بقي: `SERVER_ACTION_ORIGINS=yourdomain.com` ثم **أعد البناء** |
| `413 Request Entity Too Large` عند رفع إيصال | حدّ Nginx الافتراضي | `client_max_body_size 6m;` |
| `ENOTFOUND` من القاعدة | `DATABASE_URL` بالمضيف المباشر | استعمل صيغة Session pooler |
| `Killed` / `137` أثناء البناء | الذاكرة | ملف مبادلة (القسم ٦) |
| الخدمة تعيد التشغيل في حلقة | خطأ وقت الإقلاع | `journalctl -u tours -n 50` — غالباً متغيّر بيئة ناقص |
| الموقع يظن نفسه على `localhost` | `SITE_URL` غير مضبوط | اضبطه **وأعد البناء** |
| `401` من المؤقّتات | اختلاف السرّ | وحّد `NOTIFY_DISPATCH_KEY` بين البيئة والمؤقّت |
| الصفحات تعمل والكاش يفشل صامتاً | `ProtectSystem=strict` بلا `ReadWritePaths` | أضف `.next` كما في القسم ٧ |
| ٥٠٢ من Nginx | التطبيق ساقط | `systemctl status tours` ثم السجل |

---

## ١٥) الترقية والتراجع

**ترقية النظام** (شهرياً):

```bash
apt update && apt upgrade -y && reboot
```

الخدمة تعود وحدها بعد الإقلاع (`enable`)، والمؤقّتات كذلك.

**التراجع عن نشر فاشل:**

```bash
cd /srv/tours/app
git log --oneline -5
git checkout <الإصدار-السابق>
pnpm install --frozen-lockfile && pnpm build
sudo systemctl restart tours
```

⚠ **والهجرات لا تتراجع بـ `git checkout`.** المخطط تغيّر في القاعدة ويبقى. ولهذا
كل هجرة في هذا المشروع **إضافية** ولا تحذف عموداً — فالكود القديم يظل يعمل على
المخطط الجديد. إن احتجت تراجعاً حقيقياً في المخطط فمن نسخة احتياطية
(`docs/BACKUP.md`)، وهي الحالة التي بُنيت لأجلها.

---

## ما بعد التركيب

اكتب هنا ما تعلّمته من خادمك: كم استغرق البناء، كم ذاكرة أكل، وأي عطل واجهك ولم
يكن في القسم ١٤. الملف يُحدَّث بالتجربة لا بالنظرية.

</div>
