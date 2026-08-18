# حالة المشروع — لقطةٌ **مولَّدة**، لا مكتوبة

> ⚠ **لا تُحرَّر بيد.** هذا الملف مخرَجُ أمرٍ واحد، وأي تعديل يدويّ فيه يضيع
> في أول توليد. ومن أراد تصحيح رقمٍ هنا يصحّح **الاستعلام** في
> `scripts/state-snapshot.mjs` لا السطر.

| الأمر | ماذا يفعل | كلفته |
|---|---|---|
| `node scripts/state-snapshot.mjs` | يعيد كتابة هذا الملف كاملاً + `tsc` و`check:rsc-leaks` | ثوانٍ + دقيقة |
| `node scripts/state-snapshot.mjs --fast` | توليدٌ بلا أي بوابة | ثوانٍ |
| `node scripts/state-snapshot.mjs --gate` | ومعه `next build` و`db:test` — **للمتحقّق التسلسلي وحده** | دقائق |
| `node scripts/state-snapshot.mjs --check` | **لا يولّد**: يقول هل ما زالت اللقطة تطابق الواقع، ويخرج بـ`1` إن انحرفت بنيوياً | ثانية |

🔴 **قبل أن تبني على رقمٍ من هنا، شغّل `--check`.** لقطةٌ لا يُعرف عمرها أسوأ
من غيابها: من يقرؤها يصدّقها، ولا شيء يقول له إنها كذبت.

**وما ليس في هذا الملف:** إعدادات المالك وصفوفه الحيّة والرقم الحرّ للهجرات —
مكانها `node scripts/facts.mjs`، ولا تُستنسخ هنا كي لا يتناقض مرجعان.

---

## ١) الطابع الزمني والالتزام

```
git rev-parse --short HEAD  ·  git status --short  ·  git log -1
```

| المقياس | القيمة |
|---|---|
| وُلّدت | `2026-08-18T07:35:40.146Z` |
| الالتزام | `4df5a2a` على `main` |
| آخر كمّة | 2026-08-18T08:40:36+03:00  ·  feat: a partner agreement you can point at, a privacy page that stops under-promising, and a price that is always a number |
| ملفات غير مكمَّمة | **16** |

🔴 **الشجرة فيها عملٌ غير مكمَّم** — ونتيجة البوابة أدناه تصف *هذه* الشجرة لا الالتزام:

| الحالة | الملف |
|---|---|
| `M` | `.claude/agents/state-snapshot.md` |
| `M` | `app/admin/languages/[locale]/actions.ts` |
| `M` | `app/admin/languages/[locale]/page.tsx` |
| `M` | `app/admin/languages/_components/languages-ui.tsx` |
| `M` | `app/globals.css` |
| `M` | `docs/STANDING-ORDERS.md` |
| `M` | `handover/CONVENTIONS.md` |
| `M` | `handover/LESSONS.md` |
| `M` | `supabase/tests/append_only_tests.sql` |
| `??` | `app/admin/languages/[locale]/_components/queue-row.tsx` |
| `??` | `app/admin/languages/_components/arabic-search.ts` |
| `??` | `docs/phase-briefs/CUSTOMER-MODE.md` |
| `??` | `scripts/state-snapshot.mjs` |
| `??` | `supabase/migrations/0114_privilege_that_removes_the_guard.sql` |
| `??` | `supabase/migrations/0117_arabic_normalize.sql` |
| `??` | `supabase/tests/arabic_normalize_tests.sql` |

## ٢) المخطَّط — من الكتالوج لا من ملفات الهجرة

```sql
select c.relname, c.relrowsecurity, (select count(*) from pg_policy p where p.polrelid=c.oid),
       has_table_privilege('anon'|'authenticated', c.oid, 'SELECT|INSERT|UPDATE|DELETE|TRUNCATE')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p');
-- والأعداد: query_to_xml('select count(*) …') لكل جدول في نداءٍ واحد
```

**المنح تُقرأ بالحروف:** `r`=select · `w`=insert · `u`=update · `d`=delete · `T`=**truncate**.

🔴 **و`T` هي الحرف الذي يُقرأ أولاً:** RLS **لا تحرس `TRUNCATE`** إطلاقاً، فالمنحة
هي الحارس لا السياسة (`LESSONS` القاعدة ١٦ · الهجرة `0041`). جدولٌ سياساته محكمة
و`T` مقابله لـ`anon` = جدولٌ يستطيع أي زائرٍ تفريغه.

| الجدول | صفوف | RLS | سياسات | `anon` | `authenticated` |
|---|---:|:---:|---:|---|---|
| `audit_attempts` | 0 | ✅ | 1 | — | `r` |
| `audit_log` | 118,578 | ✅ | 1 | — | `r` |
| `block_registry` | 19 | ✅ | 1 | — | `r` |
| `booking_events` | 33 | ✅ | 1 | — | `r` |
| `booking_extras` | 2 | ✅ | 1 | — | `r` |
| `booking_failures` | 0 | ✅ | 1 | — | `r` |
| `booking_lookup_attempts` | 0 | ✅ | 0 | — | — |
| `booking_route_maps` | 5 | ✅ | 0 | — | — |
| `bookings` | 17 | ✅ | 3 | — | `rud` |
| `coupon_redemptions` | 0 | ✅ | 1 | — | `r` |
| `coupons` | 1 | ✅ | 4 | — | `rwud` |
| `customer_bookings` | 1 | ✅ | 0 | — | — |
| `discount_settings` | 1 | ✅ | 3 | — | `rwu` |
| `dispatch_settings` | 1 | ✅ | 4 | — | `rwu` |
| `dispatches` | 5 | ✅ | 4 | — | `rwud` |
| `distance_cache` | 34 | ✅ | 0 | — | — |
| `expense_categories` | 6 | ✅ | 4 | — | `rwud` |
| `expenses` | 0 | ✅ | 4 | — | `rwud` |
| `extra_services` | 1 | ✅ | 4 | — | `rwud` |
| `failure_reasons` | 6 | ✅ | 4 | — | `rwud` |
| `funnel_events` | 172 | ✅ | 1 | — | `r` |
| `geocode_cache` | 116 | ✅ | 0 | — | — |
| `ledger_entries` | 146 | ✅ | 1 | — | `r` |
| `locales` | 2 | ✅ | 4 | — | `rwud` |
| `loyalty_accounts` | 2 | ✅ | 1 | — | `r` |
| `loyalty_entries` | 114 | ✅ | 1 | — | `r` |
| `loyalty_settings` | 1 | ✅ | 2 | — | `ru` |
| `nav_links` | 4 | ✅ | 5 | `r` | `rwud` |
| `notification_providers` | 3 | ✅ | 0 | — | — |
| `notifications` | 45 | ✅ | 2 | — | `ru` |
| `page_revisions` | 15 | ✅ | 4 | — | `rwud` |
| `pages` | 23 | ✅ | 5 | `r` | `rwud` |
| `partner_agreement_acceptances` | 1 | ✅ | 0 | — | — |
| `partner_agreement_settings` | 1 | ✅ | 3 | — | `rwu` |
| `partner_agreement_versions` | 1 | ✅ | 4 | — | `rwud` |
| `partner_alert_prefs` | 0 | ✅ | 3 | — | `rwu` |
| `partner_credit_settings` | 1 | ✅ | 4 | — | `rwu` |
| `partner_payouts` | 0 | ✅ | 4 | — | `rwud` |
| `partner_push_subscriptions` | 0 | ✅ | 3 | — | `rwd` |
| `partner_settlements` | 0 | ✅ | 4 | — | `rwud` |
| `payment_accounts` | 6 | ✅ | 4 | — | `rwud` |
| `payment_events` | 5 | ✅ | 1 | — | `r` |
| `payment_intents` | 6 | ✅ | 1 | — | `r` |
| `payment_providers` | 7 | ✅ | 2 | — | `ru` |
| `payments` | 6 | ✅ | 4 | — | `rwud` |
| `place_search_settings` | 1 | ✅ | 4 | — | `rwud` |
| `price_list_items` | 4 | ✅ | 4 | — | `rwud` |
| `price_lists` | 2 | ✅ | 4 | — | `rwud` |
| `price_sheets` | 0 | ✅ | 4 | — | `rwud` |
| `pricing_settings` | 1 | ✅ | 3 | — | `wu` |
| `profiles` | 2 | ✅ | 4 | `r` | `rwud` |
| `promo_banners` | 0 | ✅ | 5 | `r` | `rwud` |
| `quote_requests` | 3 | ✅ | 4 | — | `rwud` |
| `redirects` | 0 | ✅ | 5 | `r` | `rwud` |
| `reserved_slugs` | 18 | ✅ | 1 | — | `r` |
| `schema_migrations` | 113 | ✅ | 0 | — | — |
| `sections` | 160 | ✅ | 5 | `r` | `rwud` |
| `site_settings` | 11 | ✅ | 4 | `r` | `rwu` |
| `subcontractor_drivers` | 1 | ✅ | 4 | — | `rwud` |
| `subcontractor_vehicles` | 2 | ✅ | 4 | — | `rwud` |
| `subcontractors` | 1 | ✅ | 5 | — | `rwud` |
| `tariffs` | 4 | ✅ | 4 | `r` | `rwud` |
| `translations` | 891 | ✅ | 4 | — | — |
| `trip_offers` | 3 | ✅ | 4 | — | `rwud` |
| `trip_settings` | 1 | ✅ | 4 | — | `rwu` |
| `vehicle_classes` | 4 | ✅ | 5 | `r` | `rwud` |

**المجموع: 66 جدولاً.**

### ٢ب) الاطّلاعات

```sql
select c.relname, c.relkind, array_to_string(c.reloptions, ',')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('v','m');
```

`security_invoker=true` يعني أن الاطّلاع **يرث سياسات جداوله**؛ وغيابُه يعني أنه
يعمل بصلاحيات مالكه — أي يتجاوز RLS بحكم التعريف.

| الاطّلاع | النوع | الخيارات |
|---|---|---|
| `v_account_balances` | اطّلاع | `security_invoker=true` |
| `v_booking_profit` | اطّلاع | `security_invoker=true` |
| `v_ledger_resolved` | اطّلاع | `security_invoker=true` |
| `v_loyalty_liability` | اطّلاع | `security_invoker=true` |
| `v_partner_settlements` | اطّلاع | `security_invoker=true` |
| `v_stats_content` | اطّلاع | `security_invoker=true` |
| `v_stats_customers` | اطّلاع | `security_invoker=true` |
| `v_stats_discounts` | اطّلاع | `security_invoker=true` |
| `v_stats_dispatch` | اطّلاع | `security_invoker=true` |
| `v_stats_locales` | اطّلاع | `security_invoker=true` |
| `v_stats_orders` | اطّلاع | `security_invoker=true` |
| `v_stats_partners` | اطّلاع | `security_invoker=true` |
| `v_stats_treasury` | اطّلاع | `security_invoker=true` |

**المجموع: 13.**

## ٣) الدوال

```sql
select p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid),
       p.prosecdef, p.proconfig, has_function_privilege('anon'|'authenticated', p.oid, 'execute')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind='f';
```

**لا أجسام هنا بقصد.** من يحتاج جسماً يقرؤه من `pg_get_functiondef` — لا من ملف
هجرة (**D-58**): الهجرة لقطةٌ من تاريخها وقد استُبدلت بعدها، وأخطر انحدارٍ في
المشروع وُلد من نسخ جسمٍ من `0013` بعد أن استبدلته `0014`.

**وعمودُ الإرجاع يُقرأ حقلاً حقلاً** (**D-53**): أعلى عيبٍ في دورةٍ كاملة كان
حقلاً أدرجته المواصفة في نوع إرجاع دالةٍ يقرؤها المتعهد. اسأل عن كل اسمٍ هنا:
**من يقرؤه، وماذا يفعل به من لا يحتاجه؟**

`D` = `security definer` (تتجاوز RLS بحكم التعريف) · `a` = ممنوحة لـ`anon` ·
`u` = ممنوحة لـ`authenticated` — **و`authenticated` ليست الإدارة أبداً: كل متعهدٍ واحدٌ منهم** (D-20).

| الدالة | الوسائط | تُرجع | الأعلام |
|---|---|---|---|
| `accept_offer` | `p_offer_id uuid` | TABLE(booking_id · reference · payout · assigned_at) | `Dus` |
| `accept_partner_agreement` | `p_agreement_id uuid, p_signed_name text` | TABLE(agreement_id · agreement_version · accepted_at · already) | `Dus` |
| `admin_agreement_acceptances` | `p_limit integer` | TABLE(id · subcontractor_id · subcontractor_name · agreement_version · signed_name · actor_kind · accepted_at · doc_hash … +2) | `Dus` |
| `admin_agreement_partners` | — | TABLE(subcontractor_id · company_name · status · accepted · accepted_version · accepted_at · deadline · in_grace … +1) | `Dus` |
| `admin_attach_receipt` | `p_booking_id uuid, p_amount numeric, p_receipt_path text, p_note text, p_visible boolean` | uuid | `Dus` |
| `admin_partner_availability` | — | TABLE(subcontractor_id · company_name · status · reachable · willing · available · reaching_channels · has_telegram_id … +1) | `Dus` |
| `admin_partner_telegram` | `p_subcontractor uuid` | TABLE(linked · conflict) | `Dus` |
| `admin_quote_preview` | `p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric, p_luggage integer` | TABLE(class_slug · class_title · capacity · total · base_fee · distance_cost · waiting_cost · round_trip_applied … +6) | `Dus` |
| `admin_set_trip_crew` | `p_booking_id uuid, p_vehicle_id uuid, p_driver_id uuid` | void | `Dus` |
| `analytics_admin_allowed` | — | boolean | `Ds` |
| `apply_discount` | `p_code text, p_total numeric, p_class_slug text, p_partner_cost numeric, p_phone text` | TABLE(applied · amount · total_after · clamped · rejection) | `Ds` |
| `apply_points` | `p_phone text, p_points integer, p_ride_total numeric, p_class_slug text, p_partner_cost numeric, p_coupon_amount numeric` | TABLE(applied · points · amount · total_after · clamped · rejection) | `Ds` |
| `arabic_search_key` | `p_text text` | text | `us` |
| `arabic_strip_clitics` | `p_word text` | text | `us` |
| `attach_intent_ref` | `p_intent uuid, p_ref text, p_redirect text` | TABLE(id · booking_id · provider · provider_ref · amount_minor · currency · status · redirect_url … +3) | `Ds` |
| `attach_receipt` | `p_token text, p_path text` | TABLE(payment_id · reference · status) | `Daus` |
| `attach_receipt` | `p_token text, p_path text, p_account_id uuid` | TABLE(payment_id · reference · status) | `Daus` |
| `attach_receipt` | `p_token text, p_path text, p_account_id uuid, p_amount numeric` | TABLE(payment_id · reference · status) | `Dus` |
| `audit_actor_kind` | — | text | `Ds` |
| `audit_admin_allowed` | — | boolean | `Ds` |
| `audit_clip` | `p_value jsonb` | jsonb | `s` |
| `audit_for_booking` | `p_booking_id uuid` | SETOF audit_log | `Dus` |
| `audit_for_partner` | `p_subcontractor_id uuid` | SETOF audit_log | `Dus` |
| `audit_is_freetext` | `p_key text` | boolean | `s` |
| `audit_is_secret` | `p_column text` | boolean | `s` |
| `audit_redact` | `p_row jsonb` | jsonb | `s` |
| `audit_redact_deep` | `p_value jsonb, p_depth integer` | jsonb | `s` |
| `audit_search` | `p_entity text, p_actor uuid, p_from date, p_to date, p_limit integer` | SETOF audit_log | `Dus` |
| `audit_secret_columns` | — | text[] | `s` |
| `available_payment_accounts` | `p_amount numeric` | TABLE(id · kind · label · handle · holder_name · daily_headroom · monthly_headroom) | `Dus` |
| `available_payment_accounts` | `p_token text, p_amount numeric` | TABLE(id · kind · family · label · handle · holder_name · image_url · fee … +2) | `Daus` |
| `block_registry_check` | `p_type text, p_role text, p_placement text, p_accepts_children boolean, p_max_children integer, p_text_fields text[], p_item_fields text[], p_required_fields text[], p_non_text_fields text[], p_non_text_item_fields text[]` | text | `aus` |
| `block_renders` | `p_type text, p_content jsonb` | boolean | `Dus` |
| `booking_completed_at` | `p_booking_id uuid` | timestamp with time zone | `Ds` |
| `booking_hold_until` | `p_created_at timestamp with time zone, p_pickup_at timestamp with time zone` | timestamp with time zone | `Daus` |
| `booking_min_pickup_at` | — | timestamp with time zone | `Ds` |
| `booking_payment_fee` | `p_trip jsonb, p_account_id uuid` | numeric | `s` |
| `booking_transition_allowed` | `p_from text, p_to text` | boolean | `us` |
| `builder_access` | — | text | `Dus` |
| `builder_revision_snapshot` | `p_revision uuid` | jsonb | `Dus` |
| `builder_revisions` | `p_page uuid` | TABLE(id · status · created_by · created_by_name · created_at · published_at) | `Dus` |
| `cancel_stale_bookings` | `p_limit integer` | TABLE(scanned · cancelled · failed) | `Dus` |
| `cash_flow` | `p_from date, p_to date, p_granularity text` | TABLE(bucket · inflow · outflow · net · running_balance) | `Dus` |
| `claim_notifications` | `p_limit integer, p_visible_timeout interval, p_max_attempts integer` | SETOF notifications | `s` |
| `convert_quote_request` | `p_id uuid, p_class_slug text, p_partner_cost numeric, p_dest_label text, p_subcontractor_id uuid, p_note text` | TABLE(quote_reference · booking_id · booking_reference · public_token · total · amount_due · margin_amount) | `Dus` |
| `coverage_matches` | `p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric` | TABLE(price_list_id · subcontractor_id · company_name · title · reversed) | `Ds` |
| `create_booking` | `p_origin jsonb, p_destination jsonb, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_distance_km numeric, p_duration_min numeric, p_distance_source text, p_class_slug text, p_plan text, p_customer_name text, p_customer_phone text, p_customer_whatsapp text, p_pickup_at timestamp with time zone, p_notes text, p_coupon_code text, p_return_at timestamp with time zone, p_luggage integer, p_extras jsonb, p_redeem_points integer, p_flight_number text` | TABLE(id · reference · public_token · total · amount_due · amount_remaining · currency) | `Ds` |
| `create_payment_intent` | `p_booking uuid, p_provider text, p_amount_minor integer, p_currency text` | TABLE(id · booking_id · provider · provider_ref · amount_minor · currency · status · redirect_url … +3) | `Ds` |
| `create_quote_request` | `p_service_slug text, p_customer_name text, p_customer_phone text, p_details text, p_origin_label text, p_origin_lat numeric, p_origin_lng numeric, p_dest_label text, p_dest_lat numeric, p_dest_lng numeric, p_pickup_at timestamp with time zone, p_passengers integer, p_luggage integer` | TABLE(id · reference) | `Daus` |
| `current_actor` | — | uuid | `Ds` |
| `current_subcontractor_id` | — | uuid | `Dus` |
| `current_subcontractor_status` | — | text | `Dus` |
| `current_user_role` | — | text | `Daus` |
| `derive_waiting_hours` | `p_pickup_at timestamp with time zone, p_return_at timestamp with time zone` | numeric | `aus` |
| `discount_config` | — | TABLE(enabled · max_percent · min_margin_percent_after_discount · min_margin_amount_after_discount · verify_rate_limit_per_minute) | `Ds` |
| `discount_enabled` | — | boolean | `Daus` |
| `discount_floor_room` | `p_total numeric, p_class_slug text, p_partner_cost numeric` | TABLE(min_total · room) | `Ds` |
| `discount_implied_cost` | `p_total numeric, p_partner_cost numeric` | numeric | `Ds` |
| `discount_normalize_code` | `p_code text` | text | `aus` |
| `dispatch_broadcast` | `p_booking_id uuid, p_round integer` | integer | `Ds` |
| `dispatch_ceiling` | `p_booking_id uuid, p_round integer` | numeric | `Ds` |
| `dispatch_config` | — | TABLE(window_minutes · max_rounds · auto_start · min_margin_amount) | `Ds` |
| `dispatch_ops_allowed` | — | boolean | `Ds` |
| `dispatch_pool` | `p_booking_id uuid, p_round integer` | TABLE(subcontractor_id · payout) | `Ds` |
| `dispatch_public_label` | `p_label text` | text | `s` |
| `dispatch_safe_notes` | `p_notes text` | text | `s` |
| `dispatch_tick` | — | TABLE(expired_offers · new_rounds · new_offers · escalated · cancelled · processed) | `Dus` |
| `dispatch_trip_payload` | `p_booking_id uuid, p_public boolean` | jsonb | `Ds` |
| `draft_partner_agreement_from_current` | — | uuid | `Dus` |
| `draft_publish_plan` | `p_locale text` | TABLE(id · verdict) | `Ds` |
| `draft_publish_preview` | `p_locale text` | jsonb | `Dus` |
| `enabled_locales` | — | TABLE(code · name · native_name · dir · is_default · sort · published_count) | `Daus` |
| `failed_reclass_window` | — | interval | `us` |
| `finance_admin_allowed` | — | boolean | `Ds` |
| `finance_kpis` | `p_from date, p_to date` | TABLE(revenue · partner_costs · expenses · net_profit · cash_on_hand · receivables · partner_net_due) | `Dus` |
| `find_booking_by_reference` | `p_reference text, p_phone text, p_client_key text` | TABLE(public_token) | `Ds` |
| `from_minor_units` | `p_minor bigint` | numeric | `—` |
| `funnel_counts` | `p_from date, p_to date` | TABLE(bucket_day · event_key · n) | `—` |
| `funnel_daily` | `p_from date, p_to date` | TABLE(key · label · points) | `Dus` |
| `funnel_summary` | `p_from date, p_to date` | TABLE(key · label · value · rate_percent · in_chain) | `Dus` |
| `get_booking_by_token` | `p_token text` | TABLE(id · reference · status · class_slug · class_title · total · currency · plan … +10) | `Daus` |
| `get_discount_settings` | — | TABLE(enabled · max_percent · min_margin_percent_after_discount · min_margin_amount_after_discount · verify_rate_limit_per_minute) | `Dus` |
| `get_margin_settings` | — | TABLE(margin_type · margin_value · margin_min_amount) | `Dus` |
| `get_payment_intent_status` | `p_intent uuid` | TABLE(status · booking_token) | `Daus` |
| `haversine_km` | `p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric` | numeric | `s` |
| `i18n_admin_allowed` | — | boolean | `Dus` |
| `i18n_apply` | `p_content jsonb, p_prefix text, p_map jsonb` | jsonb | `s` |
| `i18n_corpus_rows` | — | TABLE(ns · k · src) | `Ds` |
| `i18n_item_address` | `p_item jsonb, p_ordinal bigint` | text | `s` |
| `i18n_locale_active` | `p_locale text` | boolean | `Ds` |
| `i18n_non_text_field` | `p_key text` | boolean | `aus` |
| `i18n_override` | `p_obj jsonb, p_field text, p_value text` | jsonb | `s` |
| `i18n_reserved_content_key` | `p_key text` | boolean | `s` |
| `i18n_source_hash` | `p_text text` | text | `us` |
| `import_field` | `p_row jsonb, VARIADIC p_keys text[]` | text | `s` |
| `import_price_sheet_rows` | `p_sheet_id uuid, p_rows jsonb, p_commit boolean, p_subcontractor_id uuid` | TABLE(row_no · accepted · action · route_title · classes_saved · reason) | `Dus` |
| `is_admin` | — | boolean | `Daus` |
| `item_icon_allowed` | `p_icon text` | boolean | `aus` |
| `items_key_check` | `p_items jsonb` | text | `aus` |
| `jsonb_number` | `p_value jsonb, p_key text, p_default numeric` | numeric | `s` |
| `link_booking_by_reference` | `p_reference text, p_phone text, p_client_key text` | TABLE(reference) | `Dus` |
| `link_booking_by_token` | `p_token text` | TABLE(reference) | `Dus` |
| `localized_page` | `p_slug text, p_locale text` | jsonb | `Daus` |
| `localized_settings` | `p_locale text` | jsonb | `Daus` |
| `loyalty_config` | — | TABLE(enabled · points_per_currency · currency_per_point · min_redeem_points · max_redeem_percent) | `Ds` |
| `loyalty_reconcile` | — | TABLE(phone_norm · materialised · ledger_sum) | `Ds` |
| `loyalty_reverse_booking` | `p_booking_id uuid, p_note text` | integer | `Ds` |
| `manual_assign` | `p_booking_id uuid, p_subcontractor_id uuid, p_payout numeric, p_note text` | TABLE(booking · partner · payout_amount · revoked_offers) | `Dus` |
| `manual_assign_over_limit` | `p_booking_id uuid, p_subcontractor_id uuid, p_payout numeric, p_note text` | TABLE(booking · partner · payout_amount · revoked_offers) | `Dus` |
| `manual_assign_with_loss` | `p_booking_id uuid, p_subcontractor_id uuid, p_payout numeric, p_note text` | TABLE(booking · partner · payout_amount · revoked_offers) | `Dus` |
| `mark_booking_failed` | `p_booking_id uuid, p_reason_slug text, p_action text, p_deduct_amount numeric, p_note text` | TABLE(booking_id · reference · reason_slug · action_taken · deduct_amount · ledger_effect · points_reversed) | `Dus` |
| `mask_phone_tail` | `p_phone text` | text | `aus` |
| `mint_item_key` | `p_taken text[]` | text | `aus` |
| `my_bookings` | — | TABLE(reference · status · class_title · total · currency · amount_due · amount_remaining · origin_label … +4) | `Dus` |
| `my_loyalty` | — | TABLE(points · worth · currency · proven_phones) | `Dus` |
| `my_loyalty_entries` | `p_limit integer` | TABLE(id · direction · points · booking_reference · occurred_at · note) | `Dus` |
| `nav_cap` | — | integer | `aus` |
| `nav_href_ok` | `p_href text` | boolean | `aus` |
| `nav_href_reserved` | `p_href text` | boolean | `aus` |
| `new_public_token` | — | text | `s` |
| `next_booking_reference` | — | text | `Ds` |
| `next_quote_reference` | — | text | `Ds` |
| `normalize_arabic` | `p_text text` | text | `us` |
| `normalize_flight_number` | `p_flight text` | text | `us` |
| `normalize_phone` | `p_phone text` | text | `us` |
| `notification_channels` | — | text[] | `Ds` |
| `notification_channels_for` | `p_kind text, p_id uuid` | text[] | `Ds` |
| `numeric_or_null` | `p_value text` | numeric | `s` |
| `ops_notifications_dismiss` | `p_id uuid` | integer | `Dus` |
| `ops_notifications_mark_read` | `p_id uuid` | integer | `Dus` |
| `ops_notifications_restore` | `p_id uuid` | integer | `Dus` |
| `ops_telegram_chat_id` | — | text | `Ds` |
| `page_has_unpublished_changes` | `p_page uuid` | boolean | `Dus` |
| `page_public_path` | `p_kind text, p_slug text` | text | `aus` |
| `page_publish_blockers` | `p_page uuid, p_revision uuid` | SETOF text | `Dus` |
| `page_revision_diff` | `p_page uuid, p_revision uuid` | TABLE(updated · inserted · deleted) | `Ds` |
| `page_slug_conflict` | `p_kind text, p_slug text, p_page uuid` | text | `Ds` |
| `page_slug_reject` | `p_kind text, p_slug text, p_page uuid` | text | `Dus` |
| `partner_agreement_config` | — | TABLE(gate_enabled · grace_days) | `Ds` |
| `partner_agreement_current` | — | TABLE(id · version · title · preamble · clauses · doc_hash · change_note · grace_days … +1) | `Dus` |
| `partner_agreement_hash` | `p_title text, p_preamble text, p_clauses jsonb` | text | `us` |
| `partner_agreement_ok` | `p_sub uuid` | boolean | `Ds` |
| `partner_agreement_status` | `p_sub uuid` | TABLE(required · ok · accepted · version_id · version · accepted_version · accepted_at · deadline … +1) | `Ds` |
| `partner_availability` | `p_partner uuid` | TABLE(reachable · willing · available · reaching_channels) | `Ds` |
| `partner_available` | `p_partner uuid` | boolean | `Ds` |
| `partner_channels` | `p_partner uuid` | text[] | `Ds` |
| `partner_credit_config` | — | TABLE(debt_limit · block_dispatch · block_payout) | `Ds` |
| `partner_debt` | `p_sub uuid` | numeric | `Ds` |
| `partner_over_debt_limit` | `p_sub uuid` | boolean | `Ds` |
| `partner_route_map_visible` | `p_booking_id uuid` | boolean | `Dus` |
| `partner_statement` | `p_subcontractor_id uuid, p_from date, p_to date` | TABLE(occurred_at · kind · reference · debit · credit · balance · note) | `Dus` |
| `partner_trip_code` | `p_booking_id uuid` | text | `us` |
| `payment_account_customer_visible` | `p_account_id uuid` | boolean | `Ds` |
| `payment_account_family` | `p_kind text` | text | `aus` |
| `payment_accounts_within_caps` | `p_amount numeric` | TABLE(id · kind · label · handle · holder_name · daily_headroom · monthly_headroom) | `Ds` |
| `payment_fee_amount` | `p_kind text, p_value numeric, p_base numeric` | numeric | `s` |
| `payment_fee_schedule` | `p_base numeric` | jsonb | `Ds` |
| `place_search_config` | — | TABLE(google_enabled · primary_provider · map_picker_enabled · quote_fallback_enabled · min_query_chars · debounce_ms · default_center_lat · default_center_lng) | `Ds` |
| `portal_agreement` | — | TABLE(version_id · version · title · preamble · clauses · change_note · published_at · required … +7) | `Dus` |
| `portal_alert_prefs` | — | TABLE(telegram_enabled · webpush_enabled · inbox_enabled · email_enabled · accepting_offers · has_telegram_id · push_devices · reachable … +3) | `Dus` |
| `portal_balance` | — | TABLE(earned · collected · paid · received · net_due · owed_to_us · blocked · amount_to_clear) | `Dus` |
| `portal_inbox` | `p_limit integer` | TABLE(id · event · reference · offer_id · created_at · read_at · summary) | `Dus` |
| `portal_inbox_mark_read` | `p_id uuid` | integer | `Dus` |
| `portal_offers` | — | TABLE(offer_id · reference · origin_label · dest_label · distance_km · passengers · round_trip · waiting_hours … +6) | `Dus` |
| `portal_push_devices` | — | TABLE(id · label · created_at · last_seen_at) | `Dus` |
| `portal_register_push` | `p_endpoint text, p_p256dh text, p_auth text, p_agent text` | uuid | `Dus` |
| `portal_remove_push` | `p_id uuid` | boolean | `Dus` |
| `portal_set_alert_prefs` | `p_telegram boolean, p_webpush boolean, p_inbox boolean, p_email boolean, p_accept boolean` | boolean | `Dus` |
| `portal_set_telegram_chat_id` | `p_chat_id text` | boolean | `Dus` |
| `portal_telegram_is_ops` | — | boolean | `Dus` |
| `portal_trips` | — | TABLE(offer_id · booking_id · reference · origin_label · dest_label · distance_km · passengers · round_trip … +17) | `Dus` |
| `price_extras` | `p_selection jsonb` | TABLE(extra_id · slug · title · qty · unit_price · line_total) | `Daus` |
| `price_sheet_classes` | `p_subcontractor_id uuid, p_price_list_id uuid` | TABLE(slug · title · capacity · sort · covered) | `Dus` |
| `price_sheet_stats` | `p_subcontractor_id uuid` | TABLE(id · subcontractor_id · company_name · title · note · routes · draft_count · pending_count … +4) | `Dus` |
| `pricing_internals_visible` | — | boolean | `Ds` |
| `provider_ready` | `p_channel text` | boolean | `Ds` |
| `prune_audit_log` | `p_keep_days integer` | integer | `Dus` |
| `prune_funnel_events` | `p_days integer` | integer | `Dus` |
| `public_extras` | — | TABLE(slug · title · description · price · max_qty) | `Daus` |
| `publish_locale` | `p_locale text` | integer | `Dus` |
| `publish_page_revision` | `p_page uuid, p_revision uuid` | jsonb | `Dus` |
| `publish_partner_agreement` | `p_id uuid, p_grace_days integer` | TABLE(version · grace_days · published_at) | `Dus` |
| `pulse_series` | `p_section text, p_from date, p_to date` | TABLE(key · label · points) | `Dus` |
| `pulse_stats` | `p_section text, p_from date, p_to date` | TABLE(key · label · value · delta_percent · format · help) | `Dus` |
| `queue_notification` | `p_event text, p_payload jsonb` | uuid | `Ds` |
| `queue_notification` | `p_event text, p_payload jsonb, p_kind text, p_id uuid` | uuid | `Ds` |
| `quote_arg_finite` | `p_value numeric, p_label text, p_max numeric` | numeric | `aus` |
| `quote_price` | `p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric` | TABLE(class_slug · class_title · capacity · total · base_fee · distance_cost · waiting_cost · round_trip_applied … +2) | `s` |
| `quote_price` | `p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_luggage integer` | TABLE(class_slug · class_title · capacity · total · base_fee · distance_cost · waiting_cost · round_trip_applied … +2) | `s` |
| `quote_price` | `p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric, p_luggage integer` | TABLE(class_slug · class_title · capacity · total · base_fee · distance_cost · waiting_cost · round_trip_applied … +6) | `Ds` |
| `quote_public` | `p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric, p_coupon_code text, p_luggage integer, p_extras jsonb` | TABLE(class_slug · class_title · capacity · total · base_fee · distance_cost · waiting_cost · round_trip_applied … +11) | `Daus` |
| `random_ref_code` | `p_len integer` | text | `s` |
| `receipt_upload_allowed` | `p_name text` | boolean | `Daus` |
| `reconcile_revision_items` | `p_page uuid, p_revision uuid` | integer | `Ds` |
| `record_adjustment` | `p_account uuid, p_direction text, p_amount numeric, p_at timestamp with time zone, p_note text` | TABLE(entry_id · direction · amount · occurred_at · balance) | `Dus` |
| `record_audit_attempt` | `p_operation text, p_reason text, p_entity text, p_entity_id uuid, p_detail text` | void | `Dus` |
| `record_expense` | `p_account uuid, p_category uuid, p_amount numeric, p_at timestamp with time zone, p_note text, p_path text` | TABLE(id · entry_id · amount · occurred_at · balance) | `Dus` |
| `record_partner_adjustment` | `p_sub uuid, p_role text, p_amount numeric, p_at timestamp with time zone, p_note text` | uuid | `Dus` |
| `record_partner_payout` | `p_sub uuid, p_account uuid, p_amount numeric, p_at timestamp with time zone, p_note text` | TABLE(id · entry_id · amount · occurred_at · net_due · balance) | `Dus` |
| `record_partner_payout_advance` | `p_sub uuid, p_account uuid, p_amount numeric, p_at timestamp with time zone, p_note text` | TABLE(id · entry_id · amount · occurred_at · net_due · balance) | `Dus` |
| `record_partner_settlement` | `p_sub uuid, p_account uuid, p_amount numeric, p_at timestamp with time zone, p_reference text, p_note text` | TABLE(id · entry_id · amount · occurred_at · net_due · balance) | `Dus` |
| `record_refund` | `p_booking uuid, p_account uuid, p_amount numeric, p_at timestamp with time zone, p_note text` | uuid | `Dus` |
| `redeem_coupon` | `p_code text, p_booking uuid, p_amount numeric, p_phone text` | uuid | `Ds` |
| `redeem_points` | `p_booking uuid, p_phone text, p_points integer, p_amount numeric` | uuid | `Ds` |
| `reject_offer` | `p_offer_id uuid, p_reason text` | text | `Dus` |
| `reschedule_quote_request` | `p_id uuid, p_pickup_at timestamp with time zone` | TABLE(id · reference · pickup_at) | `Dus` |
| `reverse_ledger_entry` | `p_entry uuid, p_note text` | uuid | `Dus` |
| `review_and_publish_drafts` | `p_locale text` | jsonb | `Dus` |
| `review_price_list` | `p_id uuid, p_approve boolean, p_note text` | text | `Dus` |
| `review_price_sheet` | `p_id uuid, p_approve boolean, p_note text, p_expected integer` | TABLE(affected · new_status) | `Dus` |
| `review_translation` | `p_id uuid, p_value text, p_publish boolean` | jsonb | `Dus` |
| `section_parent_visible` | `p_parent uuid` | boolean | `Daus` |
| `section_stats` | `p_section text, p_from date, p_to date` | TABLE(key · label · value · delta_percent · format · help) | `Dus` |
| `secure_random_bytes` | `p_len integer` | bytea | `s` |
| `set_booking_status` | `p_booking_id uuid, p_status text, p_note text` | text | `Dus` |
| `set_quote_request_status` | `p_id uuid, p_status text, p_amount numeric, p_note text` | TABLE(id · reference · status) | `Dus` |
| `set_receipt_visibility` | `p_payment_id uuid, p_visible boolean` | boolean | `Dus` |
| `set_trip_crew` | `p_booking_id uuid, p_vehicle_id uuid, p_driver_id uuid` | void | `Dus` |
| `settle_payment_intent` | `p_provider text, p_event_id text, p_ref text, p_status text, p_amount_minor integer, p_payload jsonb` | TABLE(outcome · intent_id · booking_id · payment_id · intent_status · booking_status) | `Ds` |
| `settle_payment_intent_v2` | `p_provider text, p_event_id text, p_ref text, p_status text, p_amount_minor integer, p_currency text, p_payload jsonb` | TABLE(outcome · intent_id · booking_id · payment_id · intent_status · booking_status) | `Ds` |
| `site_nav` | `p_locale text` | jsonb | `Daus` |
| `site_time_zone` | — | text | `Daus` |
| `start_dispatch` | `p_booking_id uuid` | TABLE(status · round · offers · ceiling) | `Dus` |
| `stats_content_rows` | — | TABLE(pages_total · pages_published · pages_draft · meta_title_count · meta_desc_count · meta_complete · meta_missing · faq_pages … +2) | `Dus` |
| `stats_delta` | `p_current numeric, p_previous numeric` | numeric | `s` |
| `stats_locales_rows` | — | TABLE(code · name · native_name · dir · is_default · enabled · total · published … +5) | `Dus` |
| `submit_price_list` | `p_id uuid` | text | `Dus` |
| `submit_price_sheet` | `p_id uuid` | TABLE(submitted · kept_approved · skipped_empty) | `Dus` |
| `t` | `p_locale text, p_ns text, p_key text` | text | `Daus` |
| `telegram_chat_conflict` | `p_chat_id text, p_subcontractor uuid` | text | `Ds` |
| `to_minor_units` | `p_amount numeric` | bigint | `—` |
| `translation_corpus` | — | TABLE(namespace · key · source_text) | `Dus` |
| `translation_progress` | — | TABLE(locale · total · published · reviewed · draft · missing · stale · percent) | `Dus` |
| `translation_queue` | `p_locale text, p_status text` | TABLE(id · namespace · key · source_text · stored_source · value · status · provider … +2) | `Dus` |
| `trip_config` | — | TABLE(unpaid_cancel_enabled · unpaid_timeout_minutes · driver_phone_lead_minutes · min_lead_minutes) | `Ds` |
| `trip_pickup_at` | `p_trip jsonb` | timestamp with time zone | `us` |
| `upsert_price_list` | `p_id uuid, p_title text, p_origin_label text, p_origin_lat numeric, p_origin_lng numeric, p_origin_radius_km numeric, p_dest_label text, p_dest_lat numeric, p_dest_lng numeric, p_dest_radius_km numeric, p_bidirectional boolean, p_items jsonb, p_subcontractor_id uuid` | TABLE(id · status) | `Dus` |
| `upsert_price_sheet` | `p_id uuid, p_title text, p_note text, p_subcontractor_id uuid` | TABLE(id · title) | `Dus` |
| `upsert_translations` | `p_rows jsonb` | jsonb | `Dus` |
| `verify_payment` | `p_booking_id uuid, p_approve boolean, p_note text` | text | `Dus` |

**المجموع: 240 دالةً قابلةً للنداء** — منها **187** `definer`، و**126** منها ممنوحةٌ لـ`authenticated`.

### ٣ب) دوال المُشغّلات

57 دالةً ترجع `trigger` — أسماؤها فقط، فهي لا تُنادى مباشرةً:

```
append_only_guard · append_only_truncate_guard · assign_booking_identifiers · assign_quote_reference · block_registry_guard · booking_failures_append_only · booking_route_maps_guard · bookings_freeze_payment_fees · bookings_guard_return_leg · bookings_set_phone_norm · clear_crew_on_reassign · coupons_normalize_code · dispatches_guard_margin · dispatches_guard_reopen · finance_rows_immutable · guard_booking_failed · guard_booking_status · guard_default_locale · guard_quote_request_transition · handle_new_user · ledger_on_booking_cancelled · ledger_on_booking_completed · ledger_on_expense_deleted · ledger_on_expense_insert · ledger_on_partner_payout_deleted · ledger_on_partner_payout_insert · ledger_on_partner_settlement_deleted · ledger_on_partner_settlement_insert · ledger_on_payment_approved · log_audit · log_booking_change · log_quote_request · loyalty_apply_entry · loyalty_balance_guard · loyalty_entries_append_only · loyalty_on_booking_cancelled · loyalty_on_booking_completed · loyalty_on_booking_failed · nav_links_guard · pages_guard_slug · partner_agreement_versions_guard · partner_payouts_guard_owing · payment_accounts_block_dead_fee · payment_accounts_block_gateway_exposure · price_list_items_demote_parent · price_lists_guard_review · price_lists_guard_sheet · price_sheets_guard_delete · sections_guard_depth · sections_guard_item_keys · settings_row_no_delete · site_settings_ops_telegram_guard · subcontractors_guard_self · subcontractors_telegram_guard · touch_updated_at · trip_offers_guard_accept · trip_settings_time_zone_guard
```

و**131** مُشغّلاً مربوطاً بها على 52 جدولاً.

## ٤) الهجرات

```bash
ls supabase/migrations/*.sql | wc -l
psql -c 'select count(*) from public.schema_migrations'
```

| المقياس | القيمة |
|---|---|
| ملفات على القرص | **113** |
| صفوف في الدفتر | **113** |
| آخر ملف | `0117_arabic_normalize.sql` |
| أعلى رقم مستعمَل | `0117` |
| فجوات الترقيم | `0090` · `0091` · `0115` · `0116` |
| في الدفتر بلا ملف | لا شيء |
| على القرص بلا تطبيق | لا شيء |
| الرقم الحرّ التالي | `0118` |

🔴 **والرقم الحرّ أعلاه معلومةٌ لا إذن.** رقمُ هجرتك **يُسنَد في بريفك**، ولا
يُشتقّ. اشتقّه وكيلان مرةً كلٌّ على حدة فأخذا `0100` معاً، فجرى جسمُ هجرةٍ مرتين
وقضى المالك يوماً بدفترٍ يخالف القرص.

⚠ **والعدد لا يساوي أعلى رقم** ما دامت فجوة `0090`/`0091`/`0115`/`0116` قائمة — ولا تُملأ.

## ٥) العقود — `lib/*-types.ts`

```bash
ls lib/*-types.ts   # والأقسام تُعدّ من ترويسات التعليق المرقّمة داخل كل ملف
```

**هذه خريطة القرارات المحسومة.** ملفُّ العقد يُقرأ **قبل** لمس مجاله، ويُحدَّث
**مع** الهجرة لا بعدها (النمط ٤ في `LESSONS.md`).

| العقد | أسطر | أقسام | موضوعه |
|---|---:|---:|---|
| `lib/agent-types.ts` | 214 | 4 | عقد وكيل الذكاء الاصطناعي (المرحلة ١١) — المرجع الأوحد. |
| `lib/analytics-types.ts` | 133 | 3 | عقد الربط الخارجي والإحصائيات (المرحلة ١٠) — المرجع الأوحد. |
| `lib/audit-types.ts` | 340 | 8 | عقد نظام السجلات (الدفعة ٤ — الملاحظة ١٥) — المرجع الأوحد. |
| `lib/booking-types.ts` | 509 | 15 | عقد الحجز والدفع (المرحلة ٤) — المرجع الأوحد لأنواع الحجز وتواقيع دواله. |
| `lib/content-types.ts` | 442 | 6 | عقد نظام المحتوى (المرحلة ٢) — نموذج «الأقسام»: |
| `lib/crew-types.ts` | 197 | 5 | عقد «المركبة والسائق بعد الإسناد» (الدفعة ٥ — الملاحظة ٥، الشقّ الأول) |
| `lib/customer-types.ts` | 334 | 6 | عقد حسابات العملاء — المرحلة ١٢ب |
| `lib/discount-types.ts` | 203 | 3 | عقد الخصومات والتحفيز (المرحلة ١٢أ) — المرجع الأوحد. |
| `lib/dispatch-types.ts` | 164 | 8 | عقد البث والإسناد (المرحلة ٦) — المرجع الأوحد. |
| `lib/export-types.ts` | 198 | 2 | عقد الطباعة والمشاركة والتصدير (الدفعة ٤ — الملاحظة ٦) — المرجع الأوحد. |
| `lib/extras-types.ts` | 166 | 5 | عقد الدفعة ٣ — جراحة التسعير الواحدة (هجرة `0031`). |
| `lib/finance-types.ts` | 275 | 6 | عقد المالية (المرحلة ٧) — المرجع الأوحد. |
| `lib/i18n-types.ts` | 134 | 2 | عقد اللغات والترجمة (المرحلة ٨) — المرجع الأوحد. |
| `lib/item-fields-types.ts` | 655 | 23 | عقد الحقول غير النصّية داخل الكتل (م‑٧) — المرجع الأوحد لصور العناصر |
| `lib/loyalty-types.ts` | 197 | 8 | عقد الولاء — المرحلة ١٢ب، الشقّ الثاني (وبه تُقفل المرحلة ١٢) |
| `lib/notification-templates-types.ts` | 850 | 16 | عقد قوالب الإشعارات القابلة للتحرير — تصميمٌ وحده، ولا هجرة ولا مكوّن |
| `lib/page-builder-types.ts` | 1355 | 24 | عقد منشئ الصفحات (المرحلة ١٣) — المرجع الأوحد. يُقرأ **قبل** أول سطر SQL |
| `lib/partner-alerts-types.ts` | 299 | 3 | عقد تنبيهات المتعهدين — الموجة الثالثة، المرحلتان 🅱 و🅳 من |
| `lib/payment-fee-types.ts` | 274 | 6 | عقد عمولة بوابات الدفع — ن‑١ (الهجرة `0066`) |
| `lib/payments-types.ts` | 169 | 2 | عقد بوابات الدفع الإلكترونية (المرحلة ٩) — المرجع الأوحد. |
| `lib/place-search-types.ts` | 270 | 7 | عقد بحث الأماكن — أربع طبقات، على شكل محرّك المسافات نفسه (D-13). |
| `lib/pricing-types.ts` | 130 | 2 | عقد محرك التسعير والمسافات (المرحلة ٣) — المرجع الأوحد للأنواع والتواقيع. |
| `lib/pulse-types.ts` | 210 | 4 | عقد «نبض الصفحة» (الدفعة ٤ — الملاحظة ١٢) — المرجع الأوحد. |
| `lib/seo-types.ts` | 240 | 3 | عقد مركز السيو المتكامل (الدفعة ٤ — الملاحظة ٤) — المرجع الأوحد. |
| `lib/subcontractor-types.ts` | 198 | 5 | عقد المتعهدين وقوائم الأسعار والتغطية (المرحلة ٥) — المرجع الأوحد. |

**المجموع: 25 عقداً.**

## ٦) البوابة

🔴 **البُناة لا يشغّلون البوابة الكاملة.** قِيس ثلاث مرات في أسبوعٍ واحد أن
بوابةَ بانٍ أُبطلت بكتابة وكلاء آخرين أثناءها — فأنتجت **لا شيء** وكلّفت
`next build` كاملاً و`db:test` كاملاً على قاعدةٍ واحدة متنازَع عليها.
**البُناة يقيسون `tsc` على عملهم، والمتحقّق التسلسلي يقيس مرةً على شجرةٍ ساكنة.**

| الفحص | الأمر | الخروج | الحصيلة | الزمن |
|---|---|:---:|---|---:|
| أنواع TypeScript | `npx tsc --noEmit` | ✅ 0 | صفر خطأ | 7ث |
| تسرّب قيم `"use client"` | `pnpm check:rsc-leaks` | ✅ 0 | لا تسرّب | 2ث |

> ⚠ **`next build` و`db:test` لم يُقاسا في هذه الجولة** — وهذا هو الافتراضي
> بقصد. من يحتاجهما يشغّل `--gate` على شجرةٍ ساكنة، ولا يستشهد بغيابهما.

⚠ **وخطأ `eslint` الوحيد المعروف في `app/admin/set-password/page.tsx:40` سابقٌ**
لكل عملٍ جارٍ — ليس أثر أحد. يُقاس بـ`npx eslint app/admin/set-password/page.tsx`.

## ٧) الحالة التشغيلية

### الأعداد التي يسأل عنها كل وكيل

مأخوذةٌ من نفس نداء `query_to_xml` في §٢ — **لا استعلامَ ثانياً لها**، فلا
يتناقض رقمان لشيءٍ واحد (النمط ٨ في `LESSONS.md`).

| الكيان | صفوف |
|---|---:|
| `pages` | 23 |
| `sections` | 160 |
| `vehicle_classes` | 4 |
| `tariffs` | 4 |
| `subcontractors` | 1 |
| `price_lists` | 2 |
| `bookings` | 17 |
| `quote_requests` | 3 |
| `translations` | 891 |
| `notifications` | 45 |
| `profiles` | 2 |

### اللغات

```sql
select code, published_count from public.enabled_locales();
select locale, status, count(*) from public.translations group by 1,2;
```

| اللغة | معلَنة للزوّار | منشور |
|---|:---:|---:|
| `ar` | ✅ | 0 |
| `en` | ✅ | 889 |

| اللغة | الحالة | صفوف |
|---|---|---:|
| `en` | draft | 2 |
| `en` | published | 889 |

**السيو:** `site_settings['seo'].robots.indexable = false`

🔴 **الإنجليزية حيّةٌ للزوّار و`noindex` وحده يحجبها عن جوجل.**
**لا تنشر صفَّ ترجمةٍ واحداً ما لم يقل بريفك ذلك صراحةً، ولا تلمس `locales`.**
وارفعُ الـ`noindex` قرارُ مالكٍ لا قرارُ جلسة — وموقعٌ يبقى عليه لا يظهر في جوجل أبداً.

**مزوّدات الدفع:** 7 مزوّداً — **كلها مطفأة** ✅  ·  `select provider, enabled from payment_providers`

**قنوات الإشعارات — صفوفٌ فعلية بالقناة:** `dashboard` 43 · `inbox` 2 · `telegram` 27  ·  `select ch, count(*) from notifications, unnest(channels) ch group by 1`

**وبالحالة:** `sent` 41 · `skipped` 4  ·  `select status, count(*) from notifications group by 1`

**مفاتيح البيئة — الأسماء وحدها، ولا قيمة تُطبع:**

| المفتاح | مضبوط؟ |
|---|:---:|
| `DATABASE_URL` | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| `TELEGRAM_BOT_TOKEN` | ✅ |
| `RESEND_API_KEY` | 🔴 فارغ |
| `CRON_SECRET` | 🔴 فارغ |
| `ALLOW_TEST_PAYMENTS` | 🔴 غائب |

⚠ **و«مضبوط» ليست «يعمل».** القاعدة ١٨ في `handover/INDEX.md`: الحقل المملوء
يقول إن البيانات وصلت، لا إن المسار يعمل — والفرق يُقاس بفتح الصفحة.

## ٨) 🔴 ما هو مكسورٌ الآن — مقيسٌ، بلا رأي

| ما هو مكسور | التفصيل |
|---|---|
| قناة البريد مطفأة | `RESEND_API_KEY` غير مضبوط — بيد المالك، لا بيد جلسة |

---

## بصمةُ الطزاجة

`node scripts/state-snapshot.mjs --check` يعيد قياس هذه الإشارات وحدها ويقارنها
بالمخزَّن أدناه — ثانيةٌ واحدة بدل إعادة توليدٍ كامل.

**والإشارات صنفان بقصد:**

| الصنف | معنى اختلافها | أثرها على رمز الخروج |
|---|---|---|
| **بنيوية** (التزام · هجرات · جداول · دوال · عقود) | اللقطة صارت تصف ماضياً | يخرج بـ`1` |
| **حيّة** (حجوزات · إشعارات · ترجمات · تدقيق) | المالك عمل، والوصف ما زال صحيحاً | لا شيء |

⚠ **والفصل ليس تجميلاً**: الدرس ١٣ — «الإنذار الذي يرنّ على ضجيج يصمت يوم
الحريق». فاحصٌ يحمرّ لأن عميلاً حجز يُعلَّم قارئه تجاهُله، فيصمت يوم تُحذف دالة.

| الإشارة | الصنف | القيمة وقت التوليد | الأمر الذي أنتجها |
|---|---|---|---|
| التزام git | بنيوية | `4df5a2a` | `git rev-parse --short HEAD` |
| ملفات غير مكمَّمة | بنيوية | `16` | `git status --short   (‏عدا `docs/STATE.md` نفسه)` |
| هجرات على القرص | بنيوية | `113` | `ls supabase/migrations/*.sql \| wc -l` |
| أعلى رقم هجرة | بنيوية | `0117` | `أعلى بادئةٍ رقمية في المجلد نفسه` |
| صفوف دفتر الهجرات | بنيوية | `113` | `select count(*) from public.schema_migrations` |
| مجموعات اختبار | بنيوية | `40` | `ls supabase/tests/*.sql \| wc -l` |
| جداول public | بنيوية | `66` | `pg_class where relkind in ('r','p')` |
| اطّلاعات public | بنيوية | `13` | `pg_class where relkind in ('v','m')` |
| دوال public | بنيوية | `297` | `pg_proc where prokind='f'` |
| مُشغّلات public | بنيوية | `131` | `pg_trigger where not tgisinternal` |
| بصمة ملفات العقود | بنيوية | `152138ddcad0` | `md5 على «المسار:الحجم» لكل `lib/*-types.ts`` |
| حجوزات | حيّة | `17` | `select count(*) from public.bookings` |
| إشعارات | حيّة | `45` | `select count(*) from public.notifications` |
| ترجمات منشورة (كل اللغات) | حيّة | `889` | `select count(*) from public.translations where status='published'` |
| صفوف سجلّ التدقيق | حيّة | `118578` | `select count(*) from public.audit_log` |

<!-- STATE-FINGERPRINT {"generated_at":"2026-08-18T07:35:40.146Z","head":"4df5a2a","dirty":16,"migrations_disk":113,"migrations_highest":"0117","suites_disk":40,"contracts":"152138ddcad0","ledger_rows":113,"tables":66,"views":13,"functions":297,"triggers":131,"bookings":17,"notifications":45,"translations_published":889,"audit_log":118578} -->
