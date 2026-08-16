"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, GripVertical, KeyRound, Plus, Trash2 } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea, fieldControlClass } from "@/app/admin/content/_components/fields";
import { ITEMS_FIELD, STYLE_FIELD, type BlockDef, type BlockStyle } from "@/lib/page-builder-types";
import { ITEM_ICON_NAMES, fieldWidget } from "@/lib/item-fields-types";
import {
  CALLOUT_TONE_LABELS,
  CALLOUT_TONE_OPTIONS,
  ICON_LABELS,
  MEDIA_SUGGESTIONS,
  SPACING_LABELS,
  SPACING_OPTIONS,
  THEME_COLOR_LABELS,
  THEME_COLOR_OPTIONS,
  TYPING_HOLD_LABELS,
  TYPING_HOLD_OPTIONS,
  TYPING_SPEED_LABELS,
  TYPING_SPEED_OPTIONS,
  VIDEO_SUGGESTIONS,
  fieldLabel,
} from "@/lib/page-builder/registry";
import {
  ITEM_KEY_FIELD,
  isItemArray,
  itemsAreKeyed,
  mintItemKey,
  mintKeysForItems,
} from "@/lib/page-builder/item-keys";

/**
 * حقول كتلةٍ واحدة: النصوص العليا، وقائمة `items`، ومقابض التنسيق.
 *
 * 🔒 **قاعدة تحكم كل تعديل هنا: لا يُعاد بناء `content` من الصفر أبداً.**
 * المحرر القديم يبنيه من النموذج في كل حفظ (‏`switch` يُسقط كل مفتاح لا يعرفه)
 * فيمحو `style` و`_k` صامتاً — وهو الثمن ٣ المكتوب في موجز المرحلة. فكل تعديل
 * هنا **نشرٌ فوق الموجود** (`{ ...content, [field]: value }`)، فما لا تعرفه هذه
 * الشاشة يبقى كما هو.
 */

export type ContentPatch = (next: Record<string, unknown>) => void;

type Item = Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* إدخالٌ واحد لكل حقل — و**نوعه يُشتق من السجل لا يُخمَّن** (م‑٧)               */
/* -------------------------------------------------------------------------- */

/**
 * 🔴 **العيب الذي يُعالَج هنا مقيس:** كانت هذه الشاشة تكتشف الحقول غير النصّية
 * من `def.requiredFields` — فحقلٌ غير نصّي **اختياري** لا يظهر له إدخالٌ أصلاً.
 * وهو سبب أن وسائط البطل (`poster` و`video`) كانت موجودةً في القاعدة **وغير
 * قابلة للتحرير من المنشئ**، أي أن تبديل صورةٍ كان يستلزم محرر SQL.
 *
 * والاكتشاف اليوم **إعلانٌ في السجل**: `nonTextFields`/`nonTextItemFields`،
 * و`fieldWidget` تختار عنصر الواجهة من اسم الحقل وحده (`lib/item-fields-types.ts` §٩).
 */
function FieldInput({
  field,
  value,
  onChange,
  disabled,
  controlId,
  compact,
}: {
  field: string;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
  controlId: string;
  compact?: boolean;
}) {
  const info = fieldLabel(field);
  const widget = fieldWidget(field, info.multiline === true);

  if (widget === "icon") {
    /**
     * قائمة مغلقة لا حقل نصّ حرّ (العقد §٤): من يكتب `Plane` أو «طائرة» لا
     * يقول له شيءٌ إن الاثنين لا يعملان، فيظنّ العيب في الصورة لا في القيمة.
     * و«بلا أيقونة» خيارٌ صريح لأن الغياب معنى (الذهبية ١٥).
     */
    return (
      <select
        id={controlId}
        className={fieldControlClass}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">بلا أيقونة</option>
        {ITEM_ICON_NAMES.map((name) => (
          <option key={name} value={name}>
            {ICON_LABELS[name] ?? name}
          </option>
        ))}
      </select>
    );
  }

  if (widget === "media") {
    /**
     * منتقي الوسائط الكامل مؤجَّل (`PHASE_M7_OUT_OF_SCOPE`)، **لكن لا حقل
     * مسارٍ عارٍ**: `<datalist>` يعرض الأصول القائمة فيختار المالك بدل أن
     * يكتب ويكتشف خطأه صورةً غائبة. والحقل يبقى قابلاً للكتابة لأن دلو
     * `media` سيصير مصدراً ثانياً، و`safeMediaSrc` هي الحارس لا هذه القائمة.
     */
    const listId = `${controlId}-options`;
    const options = field === "video" ? VIDEO_SUGGESTIONS : MEDIA_SUGGESTIONS;
    return (
      <>
        <Input
          id={controlId}
          dir="ltr"
          list={listId}
          placeholder="/img/…"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <datalist id={listId}>
          {options.map((path) => (
            <option key={path} value={path} />
          ))}
        </datalist>
      </>
    );
  }

  if (widget === "id") {
    /**
     * 🆕 م‑١٠ — حقل **معرّف** لا حقل نصّ: مرساة البند تُكتب لاتينيةً صغيرة
     * بشرطات، وتُقرأ في الرابط. و`dir="ltr"` ليس تجميلاً — الحقل RTL يعرض
     * `terms-2` معكوساً فيظن كاتبه أنه أخطأ.
     *
     * والنمط على الحقل نفسه (`pattern`) فيمنعه المتصفح عند الإرسال: الرفض
     * **عند الكتابة** يراه من كتب القيمة، والرفض عند التصيير لا يراه أحد
     * (نفس مذهب القائمة المغلقة للأيقونات).
     */
    return (
      <Input
        id={controlId}
        dir="ltr"
        spellCheck={false}
        placeholder="cancellation"
        pattern="[a-z][a-z0-9-]{0,39}"
        title="حروف لاتينية صغيرة وأرقام وشرطات، تبدأ بحرف"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (widget === "textarea") {
    return (
      <Textarea
        id={controlId}
        rows={compact ? 2 : 4}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <Input
      id={controlId}
      dir={info.dir ?? "rtl"}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function readItems(content: Record<string, unknown>): Item[] {
  const raw = content[ITEMS_FIELD];
  return isItemArray(raw) ? raw : [];
}

function readStyle(content: Record<string, unknown>): BlockStyle {
  const raw = content[STYLE_FIELD];
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as BlockStyle) : {};
}

export function BlockFields({
  def,
  content,
  onChange,
  disabled,
  idPrefix,
}: {
  def: BlockDef;
  content: Record<string, unknown>;
  onChange: ContentPatch;
  disabled: boolean;
  idPrefix: string;
}) {
  /**
   * الحقول المعروضة: النصوص العليا + **كل** حقلٍ غير نصّي تعلنه الكتلة.
   *
   * ⚠ والحلقة على `requiredFields` تبقى شبكةً ثانية لا مصدراً: صفٌّ قديم قد
   * يعلن حقلاً إلزامياً لا يذكره أيٌّ من القائمتين (وهي حالةٌ يرفضها
   * `block_registry_check` اليوم، لكن الشاشة لا تفترض أن القاعدة نُظّفت).
   */
  const shownFields = React.useMemo(() => {
    const fields: string[] = [...def.textFields, ...(def.nonTextFields ?? [])];
    for (const required of def.requiredFields) {
      if (required !== ITEMS_FIELD && !fields.includes(required)) fields.unshift(required);
    }
    return fields;
  }, [def]);

  const setField = (field: string, value: string) =>
    onChange({ ...content, [field]: value });

  return (
    <div className="space-y-4">
      {shownFields.map((field) => {
        const info = fieldLabel(field);
        const controlId = `${idPrefix}-${field}`;
        const required = def.requiredFields.includes(field);
        const value = typeof content[field] === "string" ? (content[field] as string) : "";
        return (
          <div key={field} className="space-y-1.5">
            <Label htmlFor={controlId} className="flex items-center gap-1.5">
              {info.label}
              {required && <span className="text-xs text-muted-foreground">(إلزامي)</span>}
              {info.help ? <HelpTip>{info.help}</HelpTip> : null}
            </Label>
            <FieldInput
              field={field}
              value={value}
              disabled={disabled}
              controlId={controlId}
              onChange={(next) => setField(field, next)}
            />
          </div>
        );
      })}

      {def.itemFields && (
        <ItemsField
          fields={def.itemFields}
          nonTextFields={def.nonTextItemFields ?? []}
          content={content}
          onChange={onChange}
          disabled={disabled}
          idPrefix={idPrefix}
        />
      )}

      {def.styleKeys.length > 0 && (
        <StyleFields
          keys={def.styleKeys}
          content={content}
          onChange={onChange}
          disabled={disabled}
          idPrefix={idPrefix}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// قائمة العناصر — والترتيب مقفولٌ حتى تُسَكّ المفاتيح
// ---------------------------------------------------------------------------

function ItemsField({
  fields,
  nonTextFields,
  content,
  onChange,
  disabled,
  idPrefix,
}: {
  fields: readonly string[];
  /** حقول العنصر غير النصّية — صورةٌ أو أيقونة، وتُعرض بعد النصوص */
  nonTextFields: readonly string[];
  content: Record<string, unknown>;
  onChange: ContentPatch;
  disabled: boolean;
  idPrefix: string;
}) {
  const items = readItems(content);
  /** ترتيب العرض: النصّ أولاً ثم الوسائط — والمالك يقرأ ما يكتبه قبل ما يختاره */
  const allFields = React.useMemo(
    () => [...fields, ...nonTextFields],
    [fields, nonTextFields]
  );
  /**
   * البوابة الحقيقية للسحب: **كل** عنصرٍ يحمل مفتاحاً صالحاً وفريداً (‏العقد §٤)
   * — وهي الضمانة التي صارت حقيقيةً بالهجرة `0059`، إذ صار عنوان الترجمة مبنياً
   * على `_k` لا على الترتيب. وقبل `0059` كان هذا الشرط يحرس وعداً غير مبنيّ.
   */
  const keyed = itemsAreKeyed(items);
  /** ولا يُعرض مقبضٌ لمن لا يستطيع السحب — `disabled` هو دور `ops` عملياً */
  const canDrag = keyed && !disabled;
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);

  const write = (next: Item[]) => onChange({ ...content, [ITEMS_FIELD]: next });

  const setValue = (index: number, field: string, value: string) =>
    write(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  const remove = (index: number) => write(items.filter((_, i) => i !== index));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    write(next);
  };

  const add = () => {
    const taken = new Set<string>();
    for (const item of items) {
      const k = item[ITEM_KEY_FIELD];
      if (typeof k === "string") taken.add(k);
    }
    const fresh: Item = { [ITEM_KEY_FIELD]: mintItemKey(taken) };
    for (const f of allFields) fresh[f] = "";
    write([...items, fresh]);
  };

  /**
   * سكّ المفاتيح الناقصة. و`minted === 0` تعني «لا شيء تغيّر» — فلا تُكتب
   * المسودة ولا تُوسَّخ بفرقٍ لا وجود له (‏`mintKeysForItems` تتعهد بذلك نصاً).
   */
  const mintAll = () => {
    const next = mintKeysForItems(items);
    if (next.minted > 0) write(next.items);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">العناصر</span>
        <HelpTip>
          {keyed ? (
            <>
              كل عنصر في هذه القائمة يحمل مفتاحاً ثابتاً لا يتغيّر بإعادة الترتيب، وعنوان
              ترجمته مبنيٌّ على هذا المفتاح لا على موضعه — فترجمةُ العنصر تتبع العنصر نفسه
              مهما سحبتَه. (تسري على الموقع بعد النشر، لأن الترجمة تقرأ المنشور لا المسودة.)
            </>
          ) : (
            <>
              عناصر هذه القائمة بلا مفاتيح ثابتة بعد، وعنوان ترجمتها اليوم هو{" "}
              <b>ترتيبها في القائمة</b> — ولذلك إعادة الترتيب مقفولة عليها حتى تُثبَّت
              المفاتيح.
            </>
          )}
        </HelpTip>
        <span className="ms-auto text-xs text-muted-foreground">{items.length} عنصراً</span>
      </div>

      {/* 🔴 القاعدة المشتقة في العقد §٤: لا إعادة ترتيب قبل سكّ المفاتيح.
          عناصرُ صفحةٍ قديمة عنوانُ ترجمتها **ترتيبي** — فتبديل عنصرين قبل السكّ
          ينقل ترجمة الأول إلى الثاني ويعرضها على الزائر ممزوجة.

          ⚠ ونصُّ التحذير يصف ما تفعله الهجرة 0059 حرفياً لا ما نتمناه: السكّ
          ينقل عنوان الترجمة من الترتيب إلى المفتاح، فالترجمات المنشورة على
          العنوان القديم **تتوقف عن الظهور** ويعود نصُّها إلى الطابور مرة واحدة.
          وهذا ثمنٌ يُدفع مرة، مقابل ألا تُسنَد ترجمةٌ إلى عنصرٍ آخر أبداً —
          و«الترجمة الغائبة تُقرأ نقصاً، والخاطئة تُقرأ خبراً». */}
      {items.length > 0 && !keyed && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-semibold">إعادة الترتيب مقفولة على هذه القائمة</p>
          <p className="mt-1">
            عناصر هذه الكتلة بلا مفاتيح ثابتة بعد، وعنوان ترجمتها اليوم هو <b>ترتيبها</b> —
            فتبديل عنصرين ينقل ترجمة الأول إلى الثاني ويعرضها على الزائر ممزوجة. ثبّت المفاتيح
            مرة واحدة ثم رتّب كما تشاء.
          </p>
          <p className="mt-1.5 text-xs">
            <b>وما يعنيه التثبيت:</b> يتغيّر عنوان ترجمة كل عنصر من ترتيبه إلى مفتاحه. فإن
            كانت لهذه العناصر ترجمات منشورة، تتوقف عن الظهور ويعود نصُّها إلى طابور الترجمة
            لتُراجَع <b>مرة واحدة</b> — وبعدها لا ينقل السحبُ ترجمةً عن عنصرها أبداً.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={disabled}
            onClick={mintAll}
          >
            <KeyRound />
            ثبّت مفاتيح العناصر
          </Button>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">لا عناصر بعد — أضف أول عنصر.</p>
      )}

      {items.map((item, index) => {
        const itemKey = typeof item[ITEM_KEY_FIELD] === "string" ? (item[ITEM_KEY_FIELD] as string) : null;
        return (
          <div
            key={itemKey ?? `ordinal-${index}`}
            draggable={canDrag}
            onDragStart={() => setDragFrom(index)}
            onDragOver={(e) => {
              if (dragFrom !== null) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) move(dragFrom, index);
              setDragFrom(null);
            }}
            onDragEnd={() => setDragFrom(null)}
            className="space-y-2.5 rounded-lg border border-border bg-background p-3"
          >
            <div className="flex items-center gap-1">
              {/* المقبض يظهر حين يكون السحب ممكناً **فعلاً** لا حين تكون المفاتيح
                  مسكوكة وحدها: دور `ops` يفتح المنشئ للقراءة (‏العقد §٩)، ومقبضٌ
                  لا يسحب وعدٌ ثانٍ كاذب بجوار الأول. */}
              {canDrag && (
                <GripVertical
                  className="size-4 cursor-grab text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <span className="text-xs font-semibold text-muted-foreground">العنصر {index + 1}</span>
              {itemKey && (
                <code dir="ltr" className="text-[10px] text-muted-foreground/70">
                  {itemKey}
                </code>
              )}
              <span className="ms-auto inline-flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="تحريك العنصر لأعلى"
                  disabled={disabled || !keyed || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="تحريك العنصر لأسفل"
                  disabled={disabled || !keyed || index === items.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ChevronDown />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-xs"
                  aria-label="حذف العنصر"
                  disabled={disabled}
                  onClick={() => remove(index)}
                >
                  <Trash2 />
                </Button>
              </span>
            </div>

            {allFields.map((field) => {
              const info = fieldLabel(field);
              const controlId = `${idPrefix}-item-${index}-${field}`;
              const value = typeof item[field] === "string" ? (item[field] as string) : "";
              return (
                <div key={field} className="space-y-1">
                  <Label
                    htmlFor={controlId}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    {info.label}
                    {info.help ? <HelpTip>{info.help}</HelpTip> : null}
                  </Label>
                  <FieldInput
                    field={field}
                    value={value}
                    disabled={disabled}
                    controlId={controlId}
                    compact
                    onChange={(next) => setValue(index, field, next)}
                  />
                </div>
              );
            })}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={add}>
        <Plus />
        إضافة عنصر
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// التنسيق — رموز ثيم لا ألوان خام (العقد §٥ · D-01 · D-04)
// ---------------------------------------------------------------------------

function StyleFields({
  keys,
  content,
  onChange,
  disabled,
  idPrefix,
}: {
  keys: readonly (keyof BlockStyle)[];
  content: Record<string, unknown>;
  onChange: ContentPatch;
  disabled: boolean;
  idPrefix: string;
}) {
  const style = readStyle(content);

  const patchStyle = (patch: Partial<BlockStyle>) => {
    const next: Record<string, unknown> = { ...style, ...patch };
    // الحقل الغائب يعني «الافتراضي» لا «صفر» — فالقيمة الفارغة تُسقط المفتاح
    for (const [k, v] of Object.entries(next)) if (v === undefined || v === "") delete next[k];
    onChange({ ...content, [STYLE_FIELD]: next });
  };

  /**
   * 🆕 ن‑٤ — عنوان الصندوق يتبع ما فيه. كتلةٌ لا تحمل إلا مقابض الحركة
   * (‏`hero`) كان عنوانها «التنسيق» يعِد بألوانٍ وتباعدٍ لا وجود لهما، ونصّ
   * المساعدة يشرح رموز الثيم لمن لا يرى منها حقلاً واحداً.
   */
  const hasFormat = keys.some(
    (key) => key === "tone" || key === "background" || key === "spacing" || key === "hideOnMobile"
  );

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{hasFormat ? "التنسيق" : "أثر الكتابة على العنوان"}</span>
        {hasFormat ? (
          <HelpTip>
            رموز من ثيم العلامة لا ألوان مكتوبة — الرمز يتبع ألوان الهوية إن تغيّرت، واللون
            المكتوب في المحتوى يبقى على حاله ويكسر هوية أي علامة أخرى تُطلق على هذا النظام.
          </HelpTip>
        ) : (
          <HelpTip>
            إيقاع الأثر على «الجُمل المتناوبة» أعلاه. ولا يعمل شيءٌ منه ما دام الحقل فارغاً —
            ومن طلب تقليل الحركة من نظامه يرى النصّ كاملاً فوراً بلا أي حركة.
          </HelpTip>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {keys.includes("tone") && (
          /**
           * 🆕 م‑١٠ — نبرة التنبيه: **قائمة مغلقة لا لونٌ يُكتب**. الرمزان
           * يقرآن `--tone-*` من الثيم فينقلبان مع الأرضية وحدهما، ولونٌ مكتوب
           * في المحتوى كان يُصدَّر مع القالب فيُطلق العلامة الثانية بلون
           * الأولى (العقد §٥ · D-01).
           *
           * ولا خيار «بلا نبرة»: الغياب يعني «معلومة» لا الحياد — صندوقٌ
           * منبّه بلا نبرة صندوقٌ بلا سبب.
           */
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-tone`} className="text-xs text-muted-foreground">
              نبرة التنبيه
            </Label>
            <select
              id={`${idPrefix}-tone`}
              className={fieldControlClass}
              value={style.tone ?? "info"}
              disabled={disabled}
              onChange={(e) => patchStyle({ tone: e.target.value as never })}
            >
              {CALLOUT_TONE_OPTIONS.map((token) => (
                <option key={token} value={token}>
                  {CALLOUT_TONE_LABELS[token]}
                </option>
              ))}
            </select>
          </div>
        )}

        {keys.includes("background") && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-bg`} className="text-xs text-muted-foreground">
              الخلفية
            </Label>
            <select
              id={`${idPrefix}-bg`}
              className={fieldControlClass}
              value={style.background ?? "default"}
              disabled={disabled}
              onChange={(e) =>
                patchStyle({
                  background: e.target.value === "default" ? undefined : (e.target.value as never),
                })
              }
            >
              {THEME_COLOR_OPTIONS.map((token) => (
                <option key={token} value={token}>
                  {THEME_COLOR_LABELS[token]}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ── ن‑٤: إيقاع أثر الكتابة — قوائم مغلقة لا أرقام مللي ثانية ──── */}
        {keys.includes("typingSpeed") && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-typing-speed`} className="text-xs text-muted-foreground">
              سرعة الكتابة
            </Label>
            <select
              id={`${idPrefix}-typing-speed`}
              className={fieldControlClass}
              value={style.typingSpeed ?? "normal"}
              disabled={disabled}
              onChange={(e) => patchStyle({ typingSpeed: e.target.value as never })}
            >
              {TYPING_SPEED_OPTIONS.map((token) => (
                <option key={token} value={token}>
                  {TYPING_SPEED_LABELS[token]}
                </option>
              ))}
            </select>
          </div>
        )}

        {keys.includes("typingHold") && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-typing-hold`} className="text-xs text-muted-foreground">
              مهلة الثبات قبل المحو
            </Label>
            <select
              id={`${idPrefix}-typing-hold`}
              className={fieldControlClass}
              value={style.typingHold ?? "normal"}
              disabled={disabled}
              onChange={(e) => patchStyle({ typingHold: e.target.value as never })}
            >
              {TYPING_HOLD_OPTIONS.map((token) => (
                <option key={token} value={token}>
                  {TYPING_HOLD_LABELS[token]}
                </option>
              ))}
            </select>
          </div>
        )}

        {keys.includes("typingErase") && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-typing-erase`} className="text-xs text-muted-foreground">
              سرعة المحو
            </Label>
            <select
              id={`${idPrefix}-typing-erase`}
              className={fieldControlClass}
              value={style.typingErase ?? "normal"}
              disabled={disabled}
              onChange={(e) => patchStyle({ typingErase: e.target.value as never })}
            >
              {TYPING_SPEED_OPTIONS.map((token) => (
                <option key={token} value={token}>
                  {TYPING_SPEED_LABELS[token]}
                </option>
              ))}
            </select>
          </div>
        )}

        {keys.includes("spacing") && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-spacing`} className="text-xs text-muted-foreground">
              التباعد الرأسي
            </Label>
            <select
              id={`${idPrefix}-spacing`}
              className={fieldControlClass}
              value={style.spacing ?? "default"}
              disabled={disabled}
              onChange={(e) =>
                patchStyle({
                  spacing: e.target.value === "default" ? undefined : (e.target.value as never),
                })
              }
            >
              {SPACING_OPTIONS.map((token) => (
                <option key={token} value={token}>
                  {SPACING_LABELS[token]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {keys.includes("typingLoop") && (
        /**
         * 🔴 **الافتراضي «يقف»** — قرار بدر صراحةً: حركةٌ لا تنتهي على أول ما
         * تراه العين تشتّت عميلاً يملأ نموذج الحجز أسفلها مباشرة. فالمربّع
         * غير مؤشَّر ما لم يطلب المالك التكرار بيده.
         */
        <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={style.typingLoop === true}
            disabled={disabled}
            onChange={(e) => patchStyle({ typingLoop: e.target.checked ? true : undefined })}
          />
          يتكرّر بلا توقف
          <HelpTip>
            بلا تأشير: يكتب الجُمل مرة واحدة ويقف عند آخرها — وهو الافتراضي. وبالتأشير يعود
            إلى الأولى بلا نهاية، وهي حركة دائمة بجوار نموذج الحجز فاختَرها بقصد.
          </HelpTip>
        </Label>
      )}

      {keys.includes("hideOnMobile") && (
        <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={style.hideOnMobile === true}
            disabled={disabled}
            onChange={(e) => patchStyle({ hideOnMobile: e.target.checked ? true : undefined })}
          />
          إخفاء على الجوال
          <HelpTip>
            تخطيط لا محتوى: الكتلة تبقى في الصفحة وتُقرأ في نتائج البحث، لكنها لا تُعرض على
            الشاشات الصغيرة.
          </HelpTip>
        </Label>
      )}
    </div>
  );
}
