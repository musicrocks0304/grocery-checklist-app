import React from "react";
import { Menu, X } from "lucide-react";

/**
 * Shared sidebar + mobile header component used by the chatbot and grocery screens.
 * Props:
 *   sidebarOpen, setSidebarOpen — mobile drawer state
 *   currentScreen — active screen id (e.g. "grocery", "chatbot")
 *   setCurrentScreen — setter
 *   navigation — array of { id, name, icon } items
 *   children — main content rendered to the right of the sidebar
 */
const Sidebar = ({
  sidebarOpen,
  setSidebarOpen,
  currentScreen,
  setCurrentScreen,
  navigation,
  children,
}) => {
  // Derive the mobile header title from the active navigation item
  const activeNav = navigation.find((n) => n.id === currentScreen);
  const mobileTitle = activeNav ? activeNav.name : "Grocery App";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl transform ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}
      >
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-700/50 bg-gradient-to-r from-green-700 to-green-600">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm hover:bg-white/30 transition-all duration-200"
              title="Toggle navigation"
            >
              <Menu size={18} className="text-white" />
            </button>
            <h2 className="text-lg font-bold text-white">Grocery Planner</h2>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-all duration-200"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="mt-6 px-3 space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentScreen(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-4 px-4 py-3.5 text-left rounded-xl font-medium transition-all duration-200 group relative overflow-hidden ${
                  isActive
                    ? "bg-gradient-to-r from-green-600 to-green-500 text-white shadow-lg transform scale-[1.02]"
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50 hover:transform hover:scale-[1.01]"
                }`}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-green-400/20 to-green-300/20 rounded-xl blur-sm"></div>
                )}
                <div
                  className={`relative z-10 p-2 rounded-lg transition-all duration-200 ${
                    isActive
                      ? "bg-white/20 backdrop-blur-sm"
                      : "bg-slate-700/30 group-hover:bg-slate-600/50"
                  }`}
                >
                  <Icon size={20} />
                </div>
                <span className="relative z-10 text-sm font-semibold">
                  {item.name}
                </span>
                {isActive && (
                  <div className="relative z-10 ml-auto w-2 h-2 bg-white rounded-full shadow-lg"></div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Decorative gradient at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-900 via-transparent to-transparent pointer-events-none"></div>

        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3Ccircle cx='27' cy='7' r='1'/%3E%3Ccircle cx='47' cy='7' r='1'/%3E%3Ccircle cx='7' cy='27' r='1'/%3E%3Ccircle cx='27' cy='27' r='1'/%3E%3Ccircle cx='47' cy='27' r='1'/%3E%3Ccircle cx='7' cy='47' r='1'/%3E%3Ccircle cx='27' cy='47' r='1'/%3E%3Ccircle cx='47' cy='47' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-0">
        <div className="lg:hidden bg-surface shadow-sm border-b border-default">
          <div className="flex items-center justify-between px-4 h-16">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-muted hover:text-heading"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-semibold text-heading">
              {mobileTitle}
            </h1>
            <div></div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Sidebar;
