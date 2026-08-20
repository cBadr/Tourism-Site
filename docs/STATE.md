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
| وُلّدت | `2026-08-20T00:27:09.300Z` |
| الالتزام | `92cc205` على `main` |
| آخر كمّة | 2026-08-20T03:15:48+03:00  ·  feat: a partner who can finally say "I can't do this trip" — and a deduction that must name the page it stands on |
| ملفات غير مكمَّمة | **0** |

✅ **الشجرة نظيفة** — كل ما تقرؤه أدناه يصف ما هو مكمَّم.

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
| `audit_log` | 119,413 | ✅ | 1 | — | `r` |
| `block_registry` | 19 | ✅ | 1 | — | `r` |
| `booking_events` | 42 | ✅ | 1 | — | `r` |
| `booking_extras` | 2 | ✅ | 1 | — | `r` |
| `booking_failures` | 0 | ✅ | 1 | — | `r` |
| `booking_lookup_attempts` | 0 | ✅ | 0 | — | — |
| `booking_route_maps` | 7 | ✅ | 0 | — | — |
| `bookings` | 19 | ✅ | 3 | — | `rud` |
| `coupon_redemptions` | 0 | ✅ | 1 | — | `r` |
| `coupons` | 1 | ✅ | 4 | — | `rwud` |
| `customer_bookings` | 1 | ✅ | 0 | — | — |
| `customer_notification_settings` | 1 | ✅ | 2 | — | `ru` |
| `customer_push_subscriptions` | 1 | ✅ | 1 | — | `r` |
| `discount_settings` | 1 | ✅ | 3 | — | `rwu` |
| `dispatch_settings` | 1 | ✅ | 4 | — | `rwu` |
| `dispatches` | 7 | ✅ | 4 | — | `rwud` |
| `distance_cache` | 68 | ✅ | 0 | — | — |
| `expense_categories` | 6 | ✅ | 4 | — | `rwud` |
| `expenses` | 0 | ✅ | 4 | — | `rwud` |
| `extra_services` | 1 | ✅ | 4 | — | `rwud` |
| `failure_reasons` | 10 | ✅ | 4 | — | `rwud` |
| `funnel_events` | 282 | ✅ | 1 | — | `r` |
| `geocode_cache` | 239 | ✅ | 0 | — | — |
| `i18n_text_origins` | 5 | ✅ | 0 | — | — |
| `ledger_entries` | 148 | ✅ | 1 | — | `r` |
| `locales` | 2 | ✅ | 4 | — | `rwud` |
| `loyalty_accounts` | 2 | ✅ | 1 | — | `r` |
| `loyalty_entries` | 114 | ✅ | 1 | — | `r` |
| `loyalty_settings` | 1 | ✅ | 2 | — | `ru` |
| `nav_links` | 4 | ✅ | 5 | `r` | `rwud` |
| `notification_providers` | 3 | ✅ | 0 | — | — |
| `notifications` | 60 | ✅ | 2 | — | `ru` |
| `page_revisions` | 15 | ✅ | 4 | — | `rwud` |
| `pages` | 25 | ✅ | 5 | `r` | `rwud` |
| `partner_agreement_acceptances` | 1 | ✅ | 0 | — | — |
| `partner_agreement_settings` | 1 | ✅ | 3 | — | `rwu` |
| `partner_agreement_versions` | 1 | ✅ | 4 | — | `rwud` |
| `partner_alert_prefs` | 0 | ✅ | 3 | — | `rwu` |
| `partner_credit_settings` | 1 | ✅ | 4 | — | `rwu` |
| `partner_grievances` | 0 | ✅ | 2 | — | `r` |
| `partner_payouts` | 0 | ✅ | 4 | — | `rwud` |
| `partner_presence` | 1 | ✅ | 0 | — | — |
| `partner_push_subscriptions` | 0 | ✅ | 3 | — | `rwd` |
| `partner_settlements` | 0 | ✅ | 4 | — | `rwud` |
| `payment_accounts` | 7 | ✅ | 4 | — | `rwud` |
| `payment_events` | 5 | ✅ | 1 | — | `r` |
| `payment_intents` | 6 | ✅ | 1 | — | `r` |
| `payment_providers` | 7 | ✅ | 2 | — | `ru` |
| `payments` | 8 | ✅ | 4 | — | `rwud` |
| `place_search_settings` | 1 | ✅ | 4 | — | `rwud` |
| `price_list_items` | 149 | ✅ | 4 | — | `rwud` |
| `price_lists` | 100 | ✅ | 4 | — | `rwud` |
| `price_sheets` | 1 | ✅ | 4 | — | `rwud` |
| `pricing_settings` | 1 | ✅ | 3 | — | `wu` |
| `profiles` | 2 | ✅ | 4 | `r` | `rwud` |
| `promo_banners` | 1 | ✅ | 5 | `r` | `rwud` |
| `quote_requests` | 4 | ✅ | 4 | — | `rwud` |
| `redirects` | 0 | ✅ | 5 | `r` | `rwud` |
| `reserved_slugs` | 18 | ✅ | 1 | — | `r` |
| `schema_migrations` | 142 | ✅ | 0 | — | — |
| `sections` | 173 | ✅ | 5 | `r` | `rwud` |
| `site_settings` | 11 | ✅ | 4 | `r` | `rwu` |
| `subcontractor_drivers` | 1 | ✅ | 4 | — | `rwud` |
| `subcontractor_vehicles` | 3 | ✅ | 4 | — | `rwud` |
| `subcontractors` | 1 | ✅ | 5 | — | `rwud` |
| `tariffs` | 4 | ✅ | 4 | `r` | `rwud` |
| `translations` | 992 | ✅ | 4 | — | — |
| `trip_closure_settings` | 1 | ✅ | 3 | — | `rwu` |
| `trip_completion_requests` | 0 | ✅ | 2 | — | `r` |
| `trip_offers` | 6 | ✅ | 4 | — | `rwud` |
| `trip_settings` | 1 | ✅ | 4 | — | `rwu` |
| `trip_withdrawals` | 0 | ✅ | 1 | — | `r` |
| `vehicle_classes` | 4 | ✅ | 5 | `r` | `rwud` |

**المجموع: 74 جدولاً.**

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
| `admin_partner_presence` | — | TABLE(subcontractor_id · company_name · status · reachable · willing · available · reaching_channels · has_telegram_id … +3) | `Dus` |
| `admin_partner_telegram` | `p_subcontractor uuid` | TABLE(linked · conflict) | `Dus` |
| `admin_quote_preview` | `p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric, p_luggage integer` | TABLE(class_slug · class_title · capacity · total · base_fee · distance_cost · waiting_cost · round_trip_applied … +6) | `Dus` |
| `admin_search_routes` | `p_query text, p_subcontractor uuid, p_status text, p_limit integer, p_offset integer` | TABLE(id · subcontractor_id · company_name · company_status · sheet_id · sheet_title · title · origin_label … +10) | `Dus` |
| `admin_set_trip_crew` | `p_booking_id uuid, p_vehicle_id uuid, p_driver_id uuid` | void | `Dus` |
| `admin_verify_driver_license` | `p_driver_id uuid, p_verified boolean` | TABLE(driver_id · verified_by · verified_at) | `Dus` |
| `analytics_admin_allowed` | — | boolean | `Ds` |
| `apology_route` | `p_hours numeric` | text | `Dus` |
| `apply_discount` | `p_code text, p_total numeric, p_class_slug text, p_partner_cost numeric, p_phone text` | TABLE(applied · amount · total_after · clamped · rejection) | `Ds` |
| `apply_points` | `p_phone text, p_points integer, p_ride_total numeric, p_class_slug text, p_partner_cost numeric, p_coupon_amount numeric` | TABLE(applied · points · amount · total_after · clamped · rejection) | `Ds` |
| `apply_withdrawal_deduction` | `p_withdrawal_id uuid, p_amount numeric, p_note text` | numeric | `Dus` |
| `approve_trip_completion` | `p_request_id uuid, p_actor text, p_decision_note text, p_booking_note text` | uuid | `D` |
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
| `class_coverage_gaps` | — | TABLE(class_slug · class_title · capacity · vehicles · priced_routes · covered) | `Dus` |
| `convert_quote_request` | `p_id uuid, p_class_slug text, p_partner_cost numeric, p_dest_label text, p_subcontractor_id uuid, p_note text` | TABLE(quote_reference · booking_id · booking_reference · public_token · total · amount_due · margin_amount) | `Dus` |
| `coverage_best_costs` | `p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric` | TABLE(subcontractor_id · class_slug · price_list_id · cost · origin_km · dest_km · reversed) | `Ds` |
| `coverage_matches` | `p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric` | TABLE(price_list_id · subcontractor_id · company_name · title · reversed) | `Ds` |
| `create_booking` | `p_origin jsonb, p_destination jsonb, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_distance_km numeric, p_duration_min numeric, p_distance_source text, p_class_slug text, p_plan text, p_customer_name text, p_customer_phone text, p_customer_whatsapp text, p_pickup_at timestamp with time zone, p_notes text, p_coupon_code text, p_return_at timestamp with time zone, p_luggage integer, p_extras jsonb, p_redeem_points integer, p_flight_number text, p_stops jsonb` | TABLE(id · reference · public_token · total · amount_due · amount_remaining · currency) | `Ds` |
| `create_payment_intent` | `p_booking uuid, p_provider text, p_amount_minor integer, p_currency text` | TABLE(id · booking_id · provider · provider_ref · amount_minor · currency · status · redirect_url … +3) | `Ds` |
| `create_quote_request` | `p_service_slug text, p_customer_name text, p_customer_phone text, p_details text, p_origin_label text, p_origin_lat numeric, p_origin_lng numeric, p_dest_label text, p_dest_lat numeric, p_dest_lng numeric, p_pickup_at timestamp with time zone, p_passengers integer, p_luggage integer, p_source_page text, p_source_referrer text, p_utm_source text, p_utm_medium text, p_utm_campaign text` | TABLE(id · reference) | `Daus` |
| `current_actor` | — | uuid | `Ds` |
| `current_subcontractor_id` | — | uuid | `Dus` |
| `current_subcontractor_status` | — | text | `Dus` |
| `current_user_role` | — | text | `Daus` |
| `customer_channels` | `p_booking uuid` | text[] | `Ds` |
| `customer_inbox` | `p_token text, p_limit integer` | TABLE(id · event · reference · created_at · read_at · summary) | `Daus` |
| `customer_notification_payload` | `p_booking uuid` | jsonb | `Ds` |
| `customer_notifications_enabled` | — | boolean | `Ds` |
| `customer_push_registered` | `p_token text, p_endpoint text` | boolean | `Daus` |
| `customer_register_push` | `p_token text, p_endpoint text, p_p256dh text, p_auth text, p_agent text` | uuid | `Daus` |
| `customer_remove_push` | `p_token text, p_endpoint text` | boolean | `Daus` |
| `decide_trip_completion` | `p_request_id uuid, p_approve boolean, p_note text` | TABLE(request_id · booking_id · status · decided_actor) | `Dus` |
| `deduction_reason_min_chars` | — | integer | `us` |
| `deduction_reason_norm` | `p_note text` | text | `us` |
| `deduction_reason_ok` | `p_note text` | boolean | `us` |
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
| `driver_doc_path_driver` | `p_name text` | uuid | `aus` |
| `driver_doc_path_ok` | `p_name text` | boolean | `aus` |
| `driver_doc_path_owner` | `p_name text` | uuid | `aus` |
| `driver_doc_upload_allowed` | `p_name text` | boolean | `Daus` |
| `driver_documents_due_for_purge` | `p_limit integer` | TABLE(path · driver_id · subcontractor_id · reason) | `Ds` |
| `enabled_locales` | — | TABLE(code · name · native_name · dir · is_default · sort · published_count) | `Daus` |
| `end_partner_relationship` | `p_sub uuid, p_ended boolean, p_note text` | timestamp with time zone | `Dus` |
| `expire_loyalty_points` | `p_limit integer` | TABLE(accounts · points_expired) | `Ds` |
| `failed_reclass_window` | — | interval | `us` |
| `file_grievance` | `p_booking_id uuid, p_kind text, p_body text` | uuid | `Dus` |
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
| `i18n_provider_origin` | `p_provider text` | text | `Dus` |
| `i18n_reserved_content_key` | `p_key text` | boolean | `s` |
| `i18n_reserved_translation_key` | `p_key text` | boolean | `aus` |
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
| `loyalty_expiry_summary` | — | TABLE(accounts_with_points · points_live · points_due_now · points_due_30d · next_expiry_at) | `Dus` |
| `loyalty_lots` | `p_phone text` | TABLE(entry_id · earned_at · points · remaining · expires_at) | `Ds` |
| `loyalty_reconcile` | — | TABLE(phone_norm · materialised · ledger_sum) | `Ds` |
| `loyalty_reverse_booking` | `p_booking_id uuid, p_note text` | integer | `Ds` |
| `loyalty_terms_body` | `p_locale text` | text | `s` |
| `loyalty_terms_disclosure` | — | TABLE(ord · para · measure · ar · en) | `s` |
| `loyalty_terms_in_sync` | — | TABLE(clause_exists · body_ok · visible_ok · generated · snapshots_stale · en_draft_ok) | `s` |
| `loyalty_terms_resync` | `p_track_enabled boolean` | boolean | `Ds` |
| `loyalty_terms_section_id` | — | uuid | `s` |
| `manual_assign` | `p_booking_id uuid, p_subcontractor_id uuid, p_payout numeric, p_note text` | TABLE(booking · partner · payout_amount · revoked_offers) | `Dus` |
| `manual_assign_over_limit` | `p_booking_id uuid, p_subcontractor_id uuid, p_payout numeric, p_note text` | TABLE(booking · partner · payout_amount · revoked_offers) | `Dus` |
| `manual_assign_with_loss` | `p_booking_id uuid, p_subcontractor_id uuid, p_payout numeric, p_note text` | TABLE(booking · partner · payout_amount · revoked_offers) | `Dus` |
| `mark_booking_failed` | `p_booking_id uuid, p_reason_slug text, p_action text, p_deduct_amount numeric, p_note text` | TABLE(booking_id · reference · reason_slug · action_taken · deduct_amount · ledger_effect · points_reversed) | `Dus` |
| `mark_driver_documents_purged` | `p_paths text[]` | integer | `Ds` |
| `mask_phone_tail` | `p_phone text` | text | `aus` |
| `max_trip_stops` | — | integer | `Ds` |
| `mint_item_key` | `p_taken text[]` | text | `aus` |
| `my_bookings` | — | TABLE(reference · status · class_title · total · currency · amount_due · amount_remaining · origin_label … +4) | `Dus` |
| `my_loyalty` | — | TABLE(points · worth · currency · proven_phones) | `Dus` |
| `my_loyalty_entries` | `p_limit integer` | TABLE(id · direction · points · booking_reference · occurred_at · note) | `Dus` |
| `my_loyalty_expiry` | `p_limit integer` | TABLE(points · expires_at) | `Dus` |
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
| `partner_accepted_agreement` | `p_sub uuid` | TABLE(agreement_id · agreement_version · doc_hash · accepted_at) | `Ds` |
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
| `partner_response_times` | — | TABLE(subcontractor_id · company_name · offers_sent · offers_answered · median_minutes · avg_minutes) | `Dus` |
| `partner_route_map_visible` | `p_booking_id uuid` | boolean | `Dus` |
| `partner_statement` | `p_subcontractor_id uuid, p_from date, p_to date` | TABLE(occurred_at · kind · reference · debit · credit · balance · note) | `Dus` |
| `partner_trip_code` | `p_booking_id uuid` | text | `us` |
| `payment_account_customer_visible` | `p_account_id uuid` | boolean | `Ds` |
| `payment_account_family` | `p_kind text` | text | `aus` |
| `payment_accounts_within_caps` | `p_amount numeric` | TABLE(id · kind · label · handle · holder_name · daily_headroom · monthly_headroom) | `Ds` |
| `payment_fee_amount` | `p_kind text, p_value numeric, p_base numeric` | numeric | `s` |
| `payment_fee_schedule` | `p_base numeric` | jsonb | `Ds` |
| `place_search_config` | — | TABLE(google_enabled · primary_provider · map_picker_enabled · quote_fallback_enabled · min_query_chars · debounce_ms · default_center_lat · default_center_lng) | `Ds` |
| `point_in_service_area` | `p_lat numeric, p_lng numeric` | boolean | `aus` |
| `portal_agreement` | — | TABLE(version_id · version · title · preamble · clauses · change_note · published_at · required … +7) | `Dus` |
| `portal_agreement_history` | — | TABLE(acceptance_id · agreement_id · version · title · preamble · clauses · change_note · published_at … +7) | `Dus` |
| `portal_alert_prefs` | — | TABLE(telegram_enabled · webpush_enabled · inbox_enabled · email_enabled · accepting_offers · has_telegram_id · push_devices · reachable … +3) | `Dus` |
| `portal_apology_reasons` | — | TABLE(slug · label · may_deduct) | `Dus` |
| `portal_balance` | — | TABLE(earned · collected · paid · received · net_due · owed_to_us · blocked · amount_to_clear) | `Dus` |
| `portal_deductions` | `p_limit integer` | TABLE(kind · booking_id · trip_code · reason_label · amount · currency · written_reason · applied_at … +1) | `Dus` |
| `portal_grievances` | `p_limit integer` | TABLE(id · booking_reference · kind · body · status · filed_at · resolved_at · resolution_note) | `Dus` |
| `portal_inbox` | `p_limit integer` | TABLE(id · event · reference · offer_id · created_at · read_at · summary) | `Dus` |
| `portal_inbox_mark_read` | `p_id uuid` | integer | `Dus` |
| `portal_offers` | — | TABLE(offer_id · reference · origin_label · dest_label · distance_km · passengers · round_trip · waiting_hours … +7) | `Dus` |
| `portal_push_devices` | — | TABLE(id · label · created_at · last_seen_at) | `Dus` |
| `portal_register_push` | `p_endpoint text, p_p256dh text, p_auth text, p_agent text` | uuid | `Dus` |
| `portal_remove_push` | `p_id uuid` | boolean | `Dus` |
| `portal_set_alert_prefs` | `p_telegram boolean, p_webpush boolean, p_inbox boolean, p_email boolean, p_accept boolean` | boolean | `Dus` |
| `portal_set_telegram_chat_id` | `p_chat_id text` | boolean | `Dus` |
| `portal_telegram_is_ops` | — | boolean | `Dus` |
| `portal_trips` | — | TABLE(offer_id · booking_id · reference · origin_label · dest_label · distance_km · passengers · round_trip … +22) | `Dus` |
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
| `queue_customer_reminders` | `p_limit integer, p_booking_id uuid` | integer | `Ds` |
| `queue_notification` | `p_event text, p_payload jsonb` | uuid | `Ds` |
| `queue_notification` | `p_event text, p_payload jsonb, p_kind text, p_id uuid` | uuid | `Ds` |
| `quote_arg_finite` | `p_value numeric, p_label text, p_max numeric` | numeric | `aus` |
| `quote_price` | `p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric` | TABLE(class_slug · class_title · capacity · total · base_fee · distance_cost · waiting_cost · round_trip_applied … +2) | `s` |
| `quote_price` | `p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_luggage integer` | TABLE(class_slug · class_title · capacity · total · base_fee · distance_cost · waiting_cost · round_trip_applied … +2) | `s` |
| `quote_price` | `p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric, p_luggage integer, p_stops jsonb` | TABLE(class_slug · class_title · capacity · total · base_fee · distance_cost · waiting_cost · round_trip_applied … +6) | `Ds` |
| `quote_public` | `p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric, p_coupon_code text, p_luggage integer, p_extras jsonb, p_stops jsonb` | TABLE(class_slug · class_title · capacity · total · base_fee · distance_cost · waiting_cost · round_trip_applied … +11) | `Daus` |
| `quote_request_sources` | — | TABLE(kind · bucket · n · last_at) | `Dus` |
| `quote_source_host` | `p_raw text` | text | `us` |
| `quote_source_page` | `p_raw text` | text | `Dus` |
| `quote_source_tag` | `p_raw text` | text | `us` |
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
| `request_trip_completion` | `p_booking_id uuid, p_note text` | TABLE(request_id · auto_approve_at · approve_hours) | `Dus` |
| `reschedule_quote_request` | `p_id uuid, p_pickup_at timestamp with time zone` | TABLE(id · reference · pickup_at) | `Dus` |
| `resolve_grievance` | `p_id uuid, p_accept boolean, p_note text` | text | `Dus` |
| `reverse_ledger_entry` | `p_entry uuid, p_note text` | uuid | `Dus` |
| `review_and_publish_authored` | `p_locale text` | jsonb | `Dus` |
| `review_and_publish_drafts` | `p_locale text` | jsonb | `Dus` |
| `review_price_list` | `p_id uuid, p_approve boolean, p_note text` | text | `Dus` |
| `review_price_sheet` | `p_id uuid, p_approve boolean, p_note text, p_expected integer` | TABLE(affected · new_status) | `Dus` |
| `review_selected_price_lists` | `p_sheet uuid, p_ids uuid[], p_approve boolean, p_note text, p_expected integer` | TABLE(affected · new_status) | `Dus` |
| `review_translation` | `p_id uuid, p_value text, p_publish boolean` | jsonb | `Dus` |
| `section_parent_visible` | `p_parent uuid` | boolean | `Daus` |
| `section_stats` | `p_section text, p_from date, p_to date` | TABLE(key · label · value · delta_percent · format · help) | `Dus` |
| `secure_random_bytes` | `p_len integer` | bytea | `s` |
| `set_booking_status` | `p_booking_id uuid, p_status text, p_note text` | text | `Dus` |
| `set_price_list_item_cost` | `p_list uuid, p_class text, p_cost text, p_seen_cost text` | TABLE(new_cost · list_status · changed · notified) | `Dus` |
| `set_quote_request_status` | `p_id uuid, p_status text, p_amount numeric, p_note text` | TABLE(id · reference · status) | `Dus` |
| `set_receipt_visibility` | `p_payment_id uuid, p_visible boolean` | boolean | `Dus` |
| `set_trip_crew` | `p_booking_id uuid, p_vehicle_id uuid, p_driver_id uuid` | void | `Dus` |
| `settle_due_completions` | `p_limit integer` | TABLE(scanned · approved · held · skipped) | `Ds` |
| `settle_payment_intent` | `p_provider text, p_event_id text, p_ref text, p_status text, p_amount_minor integer, p_payload jsonb` | TABLE(outcome · intent_id · booking_id · payment_id · intent_status · booking_status) | `Ds` |
| `settle_payment_intent_v2` | `p_provider text, p_event_id text, p_ref text, p_status text, p_amount_minor integer, p_currency text, p_payload jsonb` | TABLE(outcome · intent_id · booking_id · payment_id · intent_status · booking_status) | `Ds` |
| `site_nav` | `p_locale text` | jsonb | `Daus` |
| `site_time_zone` | — | text | `Daus` |
| `start_dispatch` | `p_booking_id uuid` | TABLE(status · round · offers · ceiling) | `Dus` |
| `stats_content_rows` | — | TABLE(pages_total · pages_published · pages_draft · meta_title_count · meta_desc_count · meta_complete · meta_missing · faq_pages … +2) | `Dus` |
| `stats_delta` | `p_current numeric, p_previous numeric` | numeric | `s` |
| `stats_locales_rows` | — | TABLE(code · name · native_name · dir · is_default · enabled · total · published … +5) | `Dus` |
| `subcontractor_fleet_breakdown` | `p_subcontractor_id uuid` | TABLE(class_slug · title · capacity · class_active · vehicles_total · vehicles_active · vehicles_with_photo · seats_min … +2) | `us` |
| `submit_price_list` | `p_id uuid` | text | `Dus` |
| `submit_price_sheet` | `p_id uuid` | TABLE(submitted · kept_approved · skipped_empty) | `Dus` |
| `t` | `p_locale text, p_ns text, p_key text` | text | `Daus` |
| `telegram_chat_conflict` | `p_chat_id text, p_subcontractor uuid` | text | `Ds` |
| `to_minor_units` | `p_amount numeric` | bigint | `—` |
| `touch_partner_presence` | — | void | `Dus` |
| `translation_corpus` | — | TABLE(namespace · key · source_text) | `Dus` |
| `translation_progress` | — | TABLE(locale · total · published · reviewed · draft · missing · stale · percent) | `Dus` |
| `translation_queue` | `p_locale text, p_status text` | TABLE(id · namespace · key · source_text · stored_source · value · status · provider … +2) | `Dus` |
| `trip_closure_config` | — | TABLE(completion_approve_hours · apology_manual_hours · apology_deduction_enabled) | `Dus` |
| `trip_completion_gate` | `p_request_id uuid, p_auto boolean` | TABLE(code · reason) | `Ds` |
| `trip_config` | — | TABLE(unpaid_cancel_enabled · unpaid_timeout_minutes · driver_phone_lead_minutes · min_lead_minutes) | `Ds` |
| `trip_deduction_room` | `p_booking_id uuid` | TABLE(trip_due · deducted · room) | `Ds` |
| `trip_pickup_at` | `p_trip jsonb` | timestamp with time zone | `us` |
| `trip_stops_full` | `p_trip jsonb` | jsonb | `s` |
| `trip_stops_public` | `p_trip jsonb` | jsonb | `s` |
| `trip_stops_reject_reason` | `p_trip jsonb` | text | `aus` |
| `trip_straight_km` | `p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric, p_stops jsonb` | numeric | `s` |
| `upsert_price_list` | `p_id uuid, p_title text, p_origin_label text, p_origin_lat numeric, p_origin_lng numeric, p_origin_radius_km numeric, p_dest_label text, p_dest_lat numeric, p_dest_lng numeric, p_dest_radius_km numeric, p_bidirectional boolean, p_items jsonb, p_subcontractor_id uuid` | TABLE(id · status) | `Dus` |
| `upsert_price_sheet` | `p_id uuid, p_title text, p_note text, p_subcontractor_id uuid` | TABLE(id · title) | `Dus` |
| `upsert_translations` | `p_rows jsonb` | jsonb | `Dus` |
| `vehicle_photo_path_ok` | `p_name text` | boolean | `aus` |
| `vehicle_photo_path_owner` | `p_name text` | uuid | `aus` |
| `vehicle_photo_path_vehicle` | `p_name text` | uuid | `aus` |
| `vehicle_photo_upload_allowed` | `p_name text` | boolean | `Dus` |
| `verify_payment` | `p_booking_id uuid, p_approve boolean, p_note text` | text | `Dus` |
| `withdraw_from_trip` | `p_booking_id uuid, p_reason_slug text, p_note text` | TABLE(booking_id · routed · hours_to_pickup · next_round · offers · deduct_amount · deduct_applied) | `Dus` |

**المجموع: 311 دالةً قابلةً للنداء** — منها **236** `definer`، و**159** منها ممنوحةٌ لـ`authenticated`.

### ٣ب) دوال المُشغّلات

69 دالةً ترجع `trigger` — أسماؤها فقط، فهي لا تُنادى مباشرةً:

```
append_only_guard · append_only_truncate_guard · assign_booking_identifiers · assign_quote_reference · block_registry_guard · booking_failures_append_only · booking_route_maps_guard · bookings_freeze_payment_fees · bookings_guard_return_leg · bookings_guard_trip_stops · bookings_set_phone_norm · clear_crew_on_reassign · coupons_normalize_code · dispatches_guard_margin · dispatches_guard_reopen · fan_notification_to_customer · finance_rows_immutable · guard_booking_failed · guard_booking_status · guard_booking_unassign · guard_default_locale · guard_failure_deduct_reason · guard_quote_request_transition · guard_withdrawal_deduct_reason · handle_new_user · ledger_on_booking_cancelled · ledger_on_booking_completed · ledger_on_expense_deleted · ledger_on_expense_insert · ledger_on_partner_payout_deleted · ledger_on_partner_payout_insert · ledger_on_partner_settlement_deleted · ledger_on_partner_settlement_insert · ledger_on_payment_approved · log_audit · log_booking_change · log_quote_request · loyalty_apply_entry · loyalty_balance_guard · loyalty_entries_append_only · loyalty_on_booking_cancelled · loyalty_on_booking_completed · loyalty_on_booking_failed · loyalty_terms_sync · nav_links_guard · pages_guard_slug · partner_agreement_versions_guard · partner_payouts_guard_owing · payment_accounts_block_dead_fee · payment_accounts_block_gateway_exposure · price_list_items_demote_parent · price_lists_guard_review · price_lists_guard_sheet · price_sheets_guard_delete · quote_requests_normalize_source · sections_guard_depth · sections_guard_item_keys · settings_row_no_delete · site_settings_ops_telegram_guard · subcontractor_drivers_docs_guard · subcontractor_vehicles_photo_guard · subcontractors_guard_self · subcontractors_relationship_clock · subcontractors_telegram_guard · touch_updated_at · translations_guard_reserved_field · trip_offers_guard_accept · trip_settings_time_zone_guard · trip_withdrawals_freeze
```

و**149** مُشغّلاً مربوطاً بها على 57 جدولاً.

## ٤) الهجرات

```bash
ls supabase/migrations/*.sql | wc -l
psql -c 'select count(*) from public.schema_migrations'
```

| المقياس | القيمة |
|---|---|
| ملفات على القرص | **142** |
| صفوف في الدفتر | **142** |
| آخر ملف | `0147_deduction_needs_an_accepted_agreement.sql` |
| أعلى رقم مستعمَل | `0147` |
| فجوات الترقيم | `0090` · `0091` · `0116` · `0133` · `0134` |
| في الدفتر بلا ملف | لا شيء |
| على القرص بلا تطبيق | لا شيء |
| الرقم الحرّ التالي | `0148` |

🔴 **والرقم الحرّ أعلاه معلومةٌ لا إذن.** رقمُ هجرتك **يُسنَد في بريفك**، ولا
يُشتقّ. اشتقّه وكيلان مرةً كلٌّ على حدة فأخذا `0100` معاً، فجرى جسمُ هجرةٍ مرتين
وقضى المالك يوماً بدفترٍ يخالف القرص.

⚠ **والعدد لا يساوي أعلى رقم** ما دامت فجوة `0090`/`0091`/`0116`/`0133`/`0134` قائمة — ولا تُملأ.

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
| `lib/booking-types.ts` | 700 | 16 | عقد الحجز والدفع (المرحلة ٤) — المرجع الأوحد لأنواع الحجز وتواقيع دواله. |
| `lib/content-types.ts` | 442 | 6 | عقد نظام المحتوى (المرحلة ٢) — نموذج «الأقسام»: |
| `lib/crew-types.ts` | 219 | 6 | عقد «المركبة والسائق بعد الإسناد» (الدفعة ٥ — الملاحظة ٥، الشقّ الأول) |
| `lib/customer-types.ts` | 334 | 6 | عقد حسابات العملاء — المرحلة ١٢ب |
| `lib/discount-types.ts` | 203 | 3 | عقد الخصومات والتحفيز (المرحلة ١٢أ) — المرجع الأوحد. |
| `lib/dispatch-types.ts` | 164 | 8 | عقد البث والإسناد (المرحلة ٦) — المرجع الأوحد. |
| `lib/driver-docs-types.ts` | 180 | 1 | عقد «صورة السائق ورخصته» — المرجع الأوحد للهجرة `0120` وما فوقها. |
| `lib/export-types.ts` | 198 | 2 | عقد الطباعة والمشاركة والتصدير (الدفعة ٤ — الملاحظة ٦) — المرجع الأوحد. |
| `lib/extras-types.ts` | 166 | 5 | عقد الدفعة ٣ — جراحة التسعير الواحدة (هجرة `0031`). |
| `lib/finance-types.ts` | 275 | 6 | عقد المالية (المرحلة ٧) — المرجع الأوحد. |
| `lib/i18n-types.ts` | 134 | 2 | عقد اللغات والترجمة (المرحلة ٨) — المرجع الأوحد. |
| `lib/item-fields-types.ts` | 655 | 23 | عقد الحقول غير النصّية داخل الكتل (م‑٧) — المرجع الأوحد لصور العناصر |
| `lib/loyalty-types.ts` | 247 | 9 | عقد الولاء — المرحلة ١٢ب، الشقّ الثاني (وبه تُقفل المرحلة ١٢) |
| `lib/notification-templates-types.ts` | 850 | 16 | عقد قوالب الإشعارات القابلة للتحرير — تصميمٌ وحده، ولا هجرة ولا مكوّن |
| `lib/page-builder-types.ts` | 1355 | 24 | عقد منشئ الصفحات (المرحلة ١٣) — المرجع الأوحد. يُقرأ **قبل** أول سطر SQL |
| `lib/partner-alerts-types.ts` | 299 | 3 | عقد تنبيهات المتعهدين — الموجة الثالثة، المرحلتان 🅱 و🅳 من |
| `lib/payment-fee-types.ts` | 274 | 6 | عقد عمولة بوابات الدفع — ن‑١ (الهجرة `0066`) |
| `lib/payments-types.ts` | 169 | 2 | عقد بوابات الدفع الإلكترونية (المرحلة ٩) — المرجع الأوحد. |
| `lib/place-search-types.ts` | 270 | 7 | عقد بحث الأماكن — أربع طبقات، على شكل محرّك المسافات نفسه (D-13). |
| `lib/pricing-types.ts` | 130 | 2 | عقد محرك التسعير والمسافات (المرحلة ٣) — المرجع الأوحد للأنواع والتواقيع. |
| `lib/pulse-types.ts` | 210 | 4 | عقد «نبض الصفحة» (الدفعة ٤ — الملاحظة ١٢) — المرجع الأوحد. |
| `lib/request-source-types.ts` | 202 | 1 | عقد «مصدر الطلب» — من أين جاء طلب عرض السعر (هجرة 0127) |
| `lib/seo-types.ts` | 240 | 3 | عقد مركز السيو المتكامل (الدفعة ٤ — الملاحظة ٤) — المرجع الأوحد. |
| `lib/subcontractor-types.ts` | 198 | 5 | عقد المتعهدين وقوائم الأسعار والتغطية (المرحلة ٥) — المرجع الأوحد. |

**المجموع: 27 عقداً.**

## ٦) البوابة

🔴 **البُناة لا يشغّلون البوابة الكاملة.** قِيس ثلاث مرات في أسبوعٍ واحد أن
بوابةَ بانٍ أُبطلت بكتابة وكلاء آخرين أثناءها — فأنتجت **لا شيء** وكلّفت
`next build` كاملاً و`db:test` كاملاً على قاعدةٍ واحدة متنازَع عليها.
**البُناة يقيسون `tsc` على عملهم، والمتحقّق التسلسلي يقيس مرةً على شجرةٍ ساكنة.**

| الفحص | الأمر | الخروج | الحصيلة | الزمن |
|---|---|:---:|---|---:|
| أنواع TypeScript | `npx tsc --noEmit` | ✅ 0 | صفر خطأ | 9ث |
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
| `pages` | 25 |
| `sections` | 173 |
| `vehicle_classes` | 4 |
| `tariffs` | 4 |
| `subcontractors` | 1 |
| `price_lists` | 100 |
| `bookings` | 19 |
| `quote_requests` | 4 |
| `translations` | 992 |
| `notifications` | 60 |
| `profiles` | 2 |

### اللغات

```sql
select code, published_count from public.enabled_locales();
select locale, status, count(*) from public.translations group by 1,2;
```

| اللغة | معلَنة للزوّار | منشور |
|---|:---:|---:|
| `ar` | ✅ | 0 |
| `en` | ✅ | 938 |

| اللغة | الحالة | صفوف |
|---|---|---:|
| `en` | draft | 54 |
| `en` | published | 938 |

**السيو:** `site_settings['seo'].robots.indexable = false`

🔴 **الإنجليزية حيّةٌ للزوّار و`noindex` وحده يحجبها عن جوجل.**
**لا تنشر صفَّ ترجمةٍ واحداً ما لم يقل بريفك ذلك صراحةً، ولا تلمس `locales`.**
وارفعُ الـ`noindex` قرارُ مالكٍ لا قرارُ جلسة — وموقعٌ يبقى عليه لا يظهر في جوجل أبداً.

**مزوّدات الدفع:** 7 مزوّداً — **كلها مطفأة** ✅  ·  `select provider, enabled from payment_providers`

**قنوات الإشعارات — صفوفٌ فعلية بالقناة:** `dashboard` 55 · `inbox` 5 · `telegram` 42  ·  `select ch, count(*) from notifications, unnest(channels) ch group by 1`

**وبالحالة:** `sent` 56 · `skipped` 4  ·  `select status, count(*) from notifications group by 1`

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
| التزام git | بنيوية | `92cc205` | `git rev-parse --short HEAD` |
| ملفات غير مكمَّمة | بنيوية | `0` | `git status --short   (‏عدا `docs/STATE.md` نفسه)` |
| هجرات على القرص | بنيوية | `142` | `ls supabase/migrations/*.sql \| wc -l` |
| أعلى رقم هجرة | بنيوية | `0147` | `أعلى بادئةٍ رقمية في المجلد نفسه` |
| صفوف دفتر الهجرات | بنيوية | `142` | `select count(*) from public.schema_migrations` |
| مجموعات اختبار | بنيوية | `54` | `ls supabase/tests/*.sql \| wc -l` |
| جداول public | بنيوية | `74` | `pg_class where relkind in ('r','p')` |
| اطّلاعات public | بنيوية | `13` | `pg_class where relkind in ('v','m')` |
| دوال public | بنيوية | `380` | `pg_proc where prokind='f'` |
| مُشغّلات public | بنيوية | `149` | `pg_trigger where not tgisinternal` |
| بصمة ملفات العقود | بنيوية | `0eb78e4bcdf6` | `md5 على «المسار:الحجم» لكل `lib/*-types.ts`` |
| حجوزات | حيّة | `19` | `select count(*) from public.bookings` |
| إشعارات | حيّة | `60` | `select count(*) from public.notifications` |
| ترجمات منشورة (كل اللغات) | حيّة | `938` | `select count(*) from public.translations where status='published'` |
| صفوف سجلّ التدقيق | حيّة | `119413` | `select count(*) from public.audit_log` |

<!-- STATE-FINGERPRINT {"generated_at":"2026-08-20T00:27:09.300Z","head":"92cc205","dirty":0,"migrations_disk":142,"migrations_highest":"0147","suites_disk":54,"contracts":"0eb78e4bcdf6","ledger_rows":142,"tables":74,"views":13,"functions":380,"triggers":149,"bookings":19,"notifications":60,"translations_published":938,"audit_log":119413} -->
