import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Building2,
  Target,
  TrendingUp,
  GitBranch,
  LayoutGrid,
  Ticket,
  Activity,
  Mail,
  BarChart3,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/companies", label: "Companies", icon: Building2 },
  { to: "/sales/leads", label: "Leads", icon: Target },
  { to: "/sales/deals", label: "Deals", icon: TrendingUp },
  { to: "/sales/pipelines", label: "Pipelines", icon: GitBranch },
  { to: "/sales/kanban", label: "Kanban", icon: LayoutGrid },
  { to: "/tickets", label: "Tickets", icon: Ticket },
  { to: "/activities", label: "Activities", icon: Activity },
  { to: "/email", label: "Email", icon: Mail },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  return (
    <button
      onClick={() => setDark((d) => !d)}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-sm"
      aria-label="Toggle theme"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      <span>{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-gray-900 flex flex-col z-10">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-gray-700">
          <span className="text-white font-bold text-xl tracking-tight">CRM</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="px-3 py-4 border-t border-gray-700 space-y-1">
          <ThemeToggle />
          {user && (
            <div className="px-3 py-2">
              <p className="text-white text-sm font-medium truncate">{user.full_name}</p>
              <p className="text-gray-400 text-xs truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={() => void handleLogout()}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-sm"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-64 flex-1 min-h-screen bg-background">
        <Outlet />
      </main>
    </div>
  );
}
