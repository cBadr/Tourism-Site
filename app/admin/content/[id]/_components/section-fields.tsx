import type { Section, SectionContentMap } from "@/lib/content-types";
import { Field, TextareaField } from "../../_components/fields";
import { ItemsEditor } from "../../_components/items-editor";

/**
 * حقول التحرير الخاصة بكل نوع قسم — تُطبع داخل نموذج الحفظ الكبير بأسماء
 * `section-<id>-<field>` فيفكّها إجراء savePage خادمياً بحسب نوع القسم.
 * الأنواع ذات العناصر المتكررة (أسئلة/مزايا) تستخدم جزيرة العميل ItemsEditor
 * التي تُسلسل عناصرها JSON في حقل مخفي `section-<id>-items`.
 */
export function SectionFields({ section, disabled }: { section: Section; disabled: boolean }) {
  const n = (field: string) => `section-${section.id}-${field}`;

  switch (section.type) {
    case "hero": {
      const c = section.content as SectionContentMap["hero"];
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="العنوان الرئيسي"
            name={n("headline")}
            defaultValue={c.headline}
            disabled={disabled}
            help="اتركه فارغاً ليعرض الموقع اسم العلامة وشعارها من الإعدادات (انضباط الـ Whitelabel)."
          />
          <Field
            label="النص التمهيدي"
            name={n("sub")}
            defaultValue={c.sub}
            disabled={disabled}
            help="سطر تحت العنوان — الفارغ يرجع للشعار النصي من الإعدادات."
          />
        </div>
      );
    }

    case "page-hero": {
      const c = section.content as SectionContentMap["page-hero"];
      return (
        <div className="space-y-4">
          <Field label="عنوان الترويسة" name={n("title")} defaultValue={c.title} disabled={disabled} required />
          <Field label="النص التمهيدي" name={n("sub")} defaultValue={c.sub} disabled={disabled} />
          <Field
            label="نص زر الدعوة (CTA)"
            name={n("ctaLabel")}
            defaultValue={c.ctaLabel}
            disabled={disabled}
            help="اتركه فارغاً لإخفاء الزر من الترويسة."
          />
        </div>
      );
    }

    case "rich-text": {
      const c = section.content as SectionContentMap["rich-text"];
      return (
        <div className="space-y-4">
          <Field label="عنوان القسم" name={n("title")} defaultValue={c.title} disabled={disabled} />
          <TextareaField
            label="النص"
            name={n("body")}
            defaultValue={c.body}
            rows={8}
            disabled={disabled}
            help="اترك سطراً فارغاً بين الفقرات — كل فقرة تُعرض على حدة في الموقع."
          />
        </div>
      );
    }

    case "faq": {
      const c = section.content as SectionContentMap["faq"];
      return (
        <div className="space-y-4">
          <Field
            label="عنوان القسم"
            name={n("title")}
            defaultValue={c.title}
            disabled={disabled}
            help="الفارغ يعرض العنوان الافتراضي «الأسئلة الشائعة»."
          />
          <ItemsEditor
            name={n("items")}
            itemLabel="سؤال"
            addLabel="إضافة سؤال"
            disabled={disabled}
            fields={[
              { key: "q", label: "السؤال" },
              { key: "a", label: "الإجابة", multiline: true },
            ]}
            initialItems={(c.items ?? []).map((it) => ({ q: it.q ?? "", a: it.a ?? "" }))}
          />
        </div>
      );
    }

    case "features": {
      const c = section.content as SectionContentMap["features"];
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="عنوان القسم" name={n("title")} defaultValue={c.title} disabled={disabled} />
            <Field label="النص التمهيدي" name={n("sub")} defaultValue={c.sub} disabled={disabled} />
          </div>
          <ItemsEditor
            name={n("items")}
            itemLabel="ميزة"
            addLabel="إضافة ميزة"
            disabled={disabled}
            fields={[
              { key: "title", label: "عنوان الميزة" },
              { key: "text", label: "نص الميزة", multiline: true },
            ]}
            initialItems={(c.items ?? []).map((it) => ({
              title: it.title ?? "",
              text: it.text ?? "",
            }))}
          />
        </div>
      );
    }

    case "cta-band": {
      const c = section.content as SectionContentMap["cta-band"];
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="عنوان الشريط" name={n("title")} defaultValue={c.title} disabled={disabled} />
          <Field
            label="ملاحظة تحت الزر"
            name={n("note")}
            defaultValue={c.note}
            disabled={disabled}
            help="سطر صغير مطمئن مثل «الرد خلال دقائق» — الفارغ لا يظهر."
          />
        </div>
      );
    }

    // الأنواع التي تكتفي بعنوان ونص تمهيدي — بياناتها التفصيلية من النظام/الإعدادات
    case "services-grid":
    case "fleet":
    case "why-us":
    case "contact": {
      const c = section.content as SectionContentMap["services-grid"];
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="عنوان القسم"
            name={n("title")}
            defaultValue={c.title}
            disabled={disabled}
            help="الفارغ يعرض العنوان الافتراضي — محتوى البطاقات نفسه يأتي من بيانات النظام."
          />
          <Field label="النص التمهيدي" name={n("sub")} defaultValue={c.sub} disabled={disabled} />
        </div>
      );
    }
  }
}
