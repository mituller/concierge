import { Component, ErrorInfo, ReactNode, useEffect } from "react";
import { Layout } from "./components/layout/Layout";
import { useSettingsStore } from "./stores/settings";
import { useCategoriesStore } from "./stores/categories";
import { useInboxStore } from "./stores/inbox";

export default function App() {
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    void useSettingsStore.getState().load();
    void useCategoriesStore.getState().load();
    void useInboxStore.getState().load();
  }, []);

  // Theme: light / dark / automatic (follows the OS via matchMedia).
  useEffect(() => {
    const html = document.documentElement;
    const apply = () => {
      const dark =
        settings.theme === "dark" ||
        (settings.theme === "automatic" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      html.classList.toggle("dark", dark);
    };
    apply();

    if (settings.theme !== "automatic") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  return <Layout />;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 text-gray-500 bg-gray-50 dark:bg-gray-900 px-8">
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">Something went wrong</p>
          <p className="text-sm text-center max-w-md">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-[#0F2A43] text-white rounded-md text-sm hover:bg-[#163a5c]"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };