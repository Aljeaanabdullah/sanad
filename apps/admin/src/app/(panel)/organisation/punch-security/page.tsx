// S3 (PRD 4.7): the owner's switches for signed punches, and how many bound phones have a key.
import { createClient } from "@/lib/supabase/server";
import { getPrefs } from "@/lib/prefs";
import { orgT } from "@/lib/i18n-org";
import { ActionForm } from "@/components/action-form";
import { Badge, Card } from "@/components/ui";
import { updatePunchSecurity } from "../actions";

export default async function PunchSecurityPage() {
  const { lang } = await getPrefs();
  const o = orgT(lang);
  const p = o.punchSecurity;
  const supabase = await createClient();
  const [{ data: settings }, total, attested, unattested] = await Promise.all([
    supabase
      .from("punch_security_settings")
      .select("require_device_signature, allow_face_descriptor, allow_unattested_ios")
      .maybeSingle(),
    supabase.from("devices").select("id", { count: "exact", head: true }),
    supabase.from("devices").select("id", { count: "exact", head: true }).not("key_registered_at", "is", null).eq("key_attested", true),
    supabase.from("devices").select("id", { count: "exact", head: true }).not("key_registered_at", "is", null).eq("key_attested", false),
  ]);
  const s = settings ?? { require_device_signature: false, allow_face_descriptor: true, allow_unattested_ios: true };
  const all = total.count ?? 0;
  const withKey = (attested.count ?? 0) + (unattested.count ?? 0);

  const toggle = (name: keyof typeof s, label: string, hint: string) => (
    <label className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-line bg-surface-2 hover:border-line-strong has-checked:border-primary has-checked:bg-primary-soft">
      <input type="checkbox" name={name} defaultChecked={s[name]} className="mt-1 shrink-0" />
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Card>
        <p className="mb-4 text-sm text-muted">{p.intro}</p>
        <ActionForm action={updatePunchSecurity} submitLabel={o.save} savedLabel={o.saved} errors={o.errors} testId="punch-security">
          {toggle("require_device_signature", p.requireSignature, p.requireSignatureHint)}
          {toggle("allow_face_descriptor", p.allowFace, p.allowFaceHint)}
          {toggle("allow_unattested_ios", p.allowIos, p.allowIosHint)}
        </ActionForm>
      </Card>
      <Card>
        <h2 className="mb-3 font-bold">{p.keys}</h2>
        <div className="flex flex-wrap gap-2" data-testid="key-counts">
          <Badge tone="ok">
            {p.attested}: {attested.count ?? 0}
          </Badge>
          <Badge tone="off">
            {p.unattested}: {unattested.count ?? 0}
          </Badge>
          <Badge tone="off">
            {p.noKey}: {Math.max(all - withKey, 0)}
          </Badge>
        </div>
      </Card>
    </div>
  );
}
