import {
  LayoutDashboard,
  Users,
  Bell,
  Settings,
  ClipboardList,
  BarChart3,
  MessageSquare,
  Inbox,
  FolderOpen,
  AlertTriangle,
  TrendingUp,
  PieChart,
  LineChart,
  FileText,
  BookOpen,
  Copy,
} from "lucide-react";

export const sidebarConfig = {
  "system-admin": [
    {
      title: "Dashboard",
      path: "/system-admin/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Manage Users",
      path: "/system-admin/manage-users",
      icon: Users,
    },
    {
      title: "Grade Lock",
      path: "/system-admin/grade-lock",
      icon: Bell,
    },
    {
      title: "WS Config",
      path: "/system-admin/ws-config",
      icon: Settings,
    },
  ],
  admin: [
    // Duplicate mapping to support both "admin" and "system-admin" keys
    {
      title: "Dashboard",
      path: "/system-admin/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Manage Users",
      path: "/system-admin/manage-users",
      icon: Users,
    },
    {
      title: "Grade Lock",
      path: "/system-admin/grade-lock",
      icon: Bell,
    },
    {
      title: "WS Config",
      path: "/system-admin/ws-config",
      icon: Settings,
    },
  ],
  principal: [
    {
      title: "At-Risk Students",
      path: "/principal/at-risk-students",
      icon: AlertTriangle,
      submenu: [
        {
          title: "Prediction",
          path: "/principal/at-risk-students/prediction",
        },
        {
          title: "Breakdown",
          path: "/principal/at-risk-students/breakdown",
        },
      ],
    },
    {
      title: "Performance Level",
      path: "/principal/performance-level",
      icon: BarChart3,
      submenu: [
        {
          title: "By Grade Levels",
          path: "/principal/performance-level/grade-levels",
        },
        {
          title: "By Sections",
          path: "/principal/performance-level/sections",
        },
        {
          title: "By Subjects",
          path: "/principal/performance-level/subjects",
        },
        {
          title: "By Teachers",
          path: "/principal/performance-level/teachers",
        },
        {
          title: "Lowest Performers",
          path: "/principal/performance-level/lowest-performers",
        },
      ],
    },
    {
      title: "Analytics",
      path: "/principal/analytics",
      icon: Copy,
      submenu: [
        {
          title: "Subject Trend",
          path: "/principal/analytics/subject-trend",
        },
        {
          title: "Historical Comparison",
          path: "/principal/analytics/historical-comparison",
        },
      ],
    },
    {
      title: "Reports",
      path: "/principal/reports",
      icon: FileText,
    },
    {
      title: "Feedback",
      path: "/principal/feedback",
      icon: MessageSquare,
    },
  ],
  "department-head": [
    {
      title: "Dashboard",
      path: "/department-head/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Class Records",
      path: "/department-head/class-records",
      icon: FolderOpen,
    },
  ],
  departmentHead: [
    // Duplicate mapping to support camelCase
    {
      title: "Dashboard",
      path: "/department-head/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Class Records",
      path: "/department-head/class-records",
      icon: FolderOpen,
    },
  ],
  adviser: [
    {
      title: "Dashboard",
      path: "/adviser/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Sections",
      path: "/adviser/sections",
      icon: BookOpen,
    },
    {
      title: "Notifications",
      path: "/adviser/notifications",
      icon: Bell,
    },
    {
      title: "Master Sheet",
      path: "/adviser/master-sheet",
      icon: ClipboardList,
    },
    {
      title: "Performance",
      path: "/adviser/performance",
      icon: BarChart3,
    },
    {
      title: "Feedback",
      path: "/adviser/feedback",
      icon: MessageSquare,
    },
    {
      title: "Request",
      path: "/adviser/request",
      icon: Inbox,
    },
  ],
  teacher: [
    {
      title: "Dashboard",
      path: "/teacher/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Sections",
      path: "/teacher/sections",
      icon: BookOpen,
    },
    {
      title: "Notifications",
      path: "/teacher/notifications",
      icon: Bell,
    },
    {
      title: "Performance",
      path: "/teacher/performance",
      icon: BarChart3,
    },
    {
      title: "Feedback",
      path: "/teacher/feedback",
      icon: MessageSquare,
    },
    {
      title: "Request",
      path: "/teacher/request",
      icon: Inbox,
    },
  ],
  subjectTeacher: [
    // Duplicate mapping to support camelCase "subjectTeacher"
    {
      title: "Dashboard",
      path: "/teacher/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Sections",
      path: "/teacher/sections",
      icon: BookOpen,
    },
    {
      title: "Notifications",
      path: "/teacher/notifications",
      icon: Bell,
    },
    {
      title: "Performance",
      path: "/teacher/performance",
      icon: BarChart3,
    },
    {
      title: "Feedback",
      path: "/teacher/feedback",
      icon: MessageSquare,
    },
    {
      title: "Request",
      path: "/teacher/request",
      icon: Inbox,
    },
  ],
};
