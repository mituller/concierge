import { useState } from "react";
import { Plus, Trash2, CheckCircle2, Loader2, X } from "lucide-react";
import { useSettingsStore } from "../../stores/settings";
import { useCategoriesStore } from "../../stores/categories";
import { useInboxStore } from "../../stores/inbox";
import { Category, ClassifierEngine, Theme } from "../../types";
import { hasImapConfig, imapConfigFromSettings, imapTest } from "../../services/imap";
import { OpenRouterModelPicker } from "./OpenRouterModelPicker";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-sky-500";

const THEMES: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "automatic", label: "Automatic" },
];

export function Settings() {
  const { settings, update } = useSettingsStore();
  const { categories, addTopic, addPerson, merge, unmerge, rename, recolor, remove: removeCategory } =
    useCategoriesStore();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [newColor, setNewColor] = useState("#0ea5e9");
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonEmail, setNewPersonEmail] = useState("");

  // Merged categories become aliases of their parent — show only roots.
  const topicRoots = categories.filter((c) => c.kind === "topic" && !c.mergedInto);
  const personRoots = categories.filter((c) => c.kind === "person" && !c.mergedInto);
  const aliasesOf = (id: string) => categories.filter((c) => c.mergedInto === id);

  async function handleMerge(childId: string, parentId: string) {
    await merge(childId, parentId);
    void useInboxStore.getState().refresh();
  }

  async function handleUnmerge(id: string) {
    await unmerge(id);
    void useInboxStore.getState().refresh();
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await imapTest(imapConfigFromSettings(settings));
      setTestResult(`✓ ${msg}`);
    } catch (e) {
      setTestResult(`✗ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleAddCategory() {
    const name = newCategory.trim();
    if (!name) return;
    await addTopic(name, newColor);
    setNewCategory("");
  }

  async function handleAddPerson() {
    const name = newPersonName.trim();
    if (!name) return;
    await addPerson(name, newPersonEmail.trim());
    setNewPersonName("");
    setNewPersonEmail("");
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>

      {/* Appearance */}
      <Section title="Appearance">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => void update({ theme: t.id })}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                settings.theme === t.id
                  ? "bg-[#0F2A43] text-white"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Mailbox (IMAP) */}
      <Section title="Gmail (IMAP)">
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
          Read-only IMAP access — Concierge never flags, moves, or deletes mail. Sign in with an
          <strong>App Password</strong> at <code>myaccount.google.com/apppasswords</code> — requires
          2-Step Verification to be on.
        </p>

        <Field label="Email" hint="The Gmail address to sign in as.">
          <input
            type="email"
            value={settings.imapEmail}
            onChange={(e) => void update({ imapEmail: e.target.value })}
            placeholder="you@gmail.com"
            className={inputClass}
          />
        </Field>

        <Field
          label="App password"
          hint="16-character code from myaccount.google.com/apppasswords — not your normal Google password."
        >
          <input
            type="password"
            value={settings.imapPassword}
            onChange={(e) => void update({ imapPassword: e.target.value })}
            placeholder="16-char app password"
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="IMAP server">
              <input
                type="text"
                value={settings.imapHost}
                onChange={(e) => void update({ imapHost: e.target.value })}
                placeholder="imap.gmail.com"
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Port">
            <input
              type="number"
              value={settings.imapPort}
              onChange={(e) => void update({ imapPort: parseInt(e.target.value, 10) || 993 })}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Folder" hint="Usually INBOX. For everything in Gmail use [Gmail]/All Mail.">
          <input
            type="text"
            value={settings.imapFolder}
            onChange={(e) => void update({ imapFolder: e.target.value })}
            placeholder="INBOX"
            className={inputClass}
          />
        </Field>

        {testResult && (
          <p className="text-xs text-gray-600 dark:text-gray-300">{testResult}</p>
        )}

        <button
          onClick={() => void handleTest()}
          disabled={!hasImapConfig(settings) || testing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-[#0F2A43] text-white hover:bg-[#163a5c] disabled:opacity-50"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Test connection
        </button>
      </Section>

      {/* AI */}
      <Section title="AI">
        <Field label="Email classifier">
          <select
            value={settings.classifier}
            onChange={(e) => void update({ classifier: e.target.value as ClassifierEngine })}
            className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-sky-500"
          >
            <option value="jev">Jev (TypeSafe) — fast typed yes/no</option>
            <option value="deepseek">DeepSeek — chat + JSON</option>
          </select>
        </Field>
        <Field
          label="OpenRouter API key"
          hint="Both Jev and DeepSeek run through your OpenRouter account. Get a key at openrouter.ai/keys."
        >
          <input
            type="password"
            value={settings.openRouterApiKey}
            onChange={(e) => void update({ openRouterApiKey: e.target.value })}
            placeholder="sk-or-…"
            className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-sky-500"
          />
        </Field>
        <Field
          label="Model (DeepSeek)"
          hint="Used for on-demand summaries, and for classification when the engine above is DeepSeek. Default: deepseek/deepseek-v4.1-flash."
        >
          <OpenRouterModelPicker
            value={settings.openRouterModel}
            onChange={(id) => void update({ openRouterModel: id })}
          />
        </Field>
      </Section>

      {/* Categories */}
      <Section title="Categories">
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
          Topic categories sort every message (an email can be in several). Person categories are
          who an email is <strong>about</strong>: the top 10 are auto-discovered from your mail,
          and you can add more by hand.
        </p>

        <div className="space-y-2">
          {topicRoots.map((c) => (
            <div key={c.id} className="space-y-1">
              <CategoryRow
                category={c}
                onRename={(name) => void rename(c.id, name)}
                onRecolor={(color) => void recolor(c.id, color)}
                onRemove={() => void removeCategory(c.id)}
              />
              <MergeRow
                category={c}
                targets={topicRoots.filter((t) => t.id !== c.id)}
                aliases={aliasesOf(c.id)}
                onMerge={handleMerge}
                onUnmerge={handleUnmerge}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-8 w-10 rounded border border-gray-200 dark:border-gray-700 cursor-pointer"
          />
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddCategory();
            }}
            placeholder="New category name…"
            className="flex-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-sky-500"
          />
          <button
            onClick={() => void handleAddCategory()}
            disabled={!newCategory.trim()}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="text"
            value={newPersonName}
            onChange={(e) => setNewPersonName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddPerson();
            }}
            placeholder="Person name…"
            className="flex-1 min-w-0 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-sky-500"
          />
          <input
            type="text"
            value={newPersonEmail}
            onChange={(e) => setNewPersonEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddPerson();
            }}
            placeholder="email (optional)"
            className="w-44 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 outline-none focus:border-sky-500"
          />
          <button
            onClick={() => void handleAddPerson()}
            disabled={!newPersonName.trim()}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <Plus size={14} /> Add person
          </button>
        </div>

        {personRoots.length > 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">People</p>
            {personRoots.map((c) => (
              <div key={c.id} className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 px-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="font-medium text-gray-800 dark:text-gray-100">{c.name}</span>
                  {c.personEmail && <span className="text-xs text-gray-400">{c.personEmail}</span>}
                  <button
                    onClick={() => void removeCategory(c.id)}
                    title="Delete person"
                    className="ml-auto text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <MergeRow
                  category={c}
                  targets={personRoots.filter((t) => t.id !== c.id)}
                  aliases={aliasesOf(c.id)}
                  onMerge={handleMerge}
                  onUnmerge={handleUnmerge}
                />
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function MergeRow({
  category,
  targets,
  aliases,
  onMerge,
  onUnmerge,
}: {
  category: Category;
  targets: Category[];
  aliases: Category[];
  onMerge: (childId: string, parentId: string) => void;
  onUnmerge: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pl-2 text-xs">
      {aliases.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">also</span>
          {aliases.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-gray-600 dark:text-gray-300"
            >
              {a.name}
              <button onClick={() => onUnmerge(a.id)} title="Detach" className="hover:text-red-500">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {targets.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onMerge(category.id, e.target.value);
          }}
          title="Combine this category into another"
          className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-600 dark:text-gray-300"
        >
          <option value="">Combine into…</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  onRename,
  onRecolor,
  onRemove,
}: {
  category: Category;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(category.name);
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1.5">
      <input
        type="color"
        defaultValue={category.color}
        onChange={(e) => onRecolor(e.target.value)}
        className="h-6 w-8 rounded border border-gray-200 dark:border-gray-700 cursor-pointer"
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name !== category.name) onRename(name.trim());
        }}
        className="flex-1 min-w-0 bg-transparent text-sm text-gray-800 dark:text-gray-100 outline-none px-1 py-1 rounded focus:bg-gray-50 dark:focus:bg-gray-900"
      />
      <button onClick={onRemove} className="text-gray-400 hover:text-red-500" title="Delete category">
        <Trash2 size={15} />
      </button>
    </div>
  );
}