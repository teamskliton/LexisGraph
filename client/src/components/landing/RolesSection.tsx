import {
  Crown,
  ClipboardList,
  UserCheck,
  Eye,
} from "lucide-react";
import { ROLES } from "./landing-content";

const ICON_MAP: Record<string, React.ElementType> = {
  Crown,
  ClipboardList,
  UserCheck,
  Eye,
};

export default function RolesSection() {
  return (
    <section
      id="roles"
      aria-labelledby="roles-heading"
      className="landing-section bg-background"
    >
      <div className="landing-container">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="section-label justify-center">Roles & Teams</div>
          <h2
            id="roles-heading"
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-3"
          >
            Built for every person on your compliance team.
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed mx-auto" style={{ maxWidth: "540px" }}>
            LexisGraph supports structured role-based access so each team member works within appropriate boundaries.
          </p>
        </div>

        {/* Roles grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {ROLES.map((role) => {
            const Icon = ICON_MAP[role.icon];
            return (
              <div
                key={role.title}
                className="feature-card p-6 flex flex-col gap-4"
              >
                {/* Icon */}
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ background: "var(--primary-subtle)", color: "var(--primary)" }}
                >
                  {Icon && <Icon className="w-5 h-5" aria-hidden="true" />}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-2">
                  <h3 className="text-base font-semibold text-foreground">{role.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{role.description}</p>
                </div>

                {/* Permissions */}
                <ul className="flex flex-col gap-1.5 mt-auto" role="list">
                  {role.permissions.map((perm) => (
                    <li key={perm} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                        style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      {perm}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
