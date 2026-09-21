import Link from "next/link";
import SiteNavbar from "@/components/layout/SiteNavbar";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background grid-bg">
      <SiteNavbar />

      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-margin">
        <div className="grid max-w-6xl grid-cols-1 items-center gap-12 md:grid-cols-2">
          {/* Text content */}
          <div className="flex flex-col gap-6">
            <h1 className="text-4xl font-semibold leading-none tracking-tight text-on-background md:text-[48px] md:leading-[56px]">
              Diagramador de Clases
            </h1>
            <p className="max-w-md text-lg text-on-surface-variant">
              Diseña arquitectura UML con precisión técnica y exportación
              directa a código.
            </p>
            <div className="pt-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 border border-primary-container px-8 py-3 text-lg text-primary-container transition-colors duration-200 hover:bg-primary-container/10"
              >
                Iniciar Proyecto
              </Link>
            </div>
          </div>

          {/* UML illustration */}
          <CustomerPreviewDiagram />
        </div>
      </main>
    </div>
  );
}

function CustomerPreviewDiagram() {
  return (
    <div className="relative flex h-[500px] w-full items-center justify-center">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      >
        <path
          d="M 150 150 L 150 250 L 300 250 L 300 350"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.5"
        />
        <path
          d="M 450 150 L 450 200 L 300 200 L 300 250"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.5"
        />
        <polygon fill="#22d3ee" points="295,340 305,340 300,350" />
        <polygon fill="#22d3ee" points="145,160 155,160 150,150" />
      </svg>

      <ClassCard className="absolute left-[50px] top-[80px]" title="UserAccount">
        <Row>
          <Marker type="attr">-</Marker> id: UUID
        </Row>
        <Row>
          <Marker type="attr">-</Marker> email: String
        </Row>
        <Row>
          <Marker type="method">+</Marker> authenticate()
        </Row>
      </ClassCard>

      <ClassCard className="absolute right-[50px] top-[80px]" title="Project">
        <Row>
          <Marker type="attr">-</Marker> projectId: String
        </Row>
        <Row>
          <Marker type="attr">-</Marker> status: Enum
        </Row>
        <Row>
          <Marker type="method">+</Marker> exportCode()
        </Row>
      </ClassCard>

      <ClassCard
        className="absolute bottom-[50px] left-[150px]"
        title="SystemArchitect"
      >
        <Row>
          <Marker type="attr">-</Marker> diagrams: List&lt;Project&gt;
        </Row>
        <Row>
          <Marker type="method">+</Marker> validateSchema()
        </Row>
        <Row>
          <Marker type="method">+</Marker> generateLayout()
        </Row>
      </ClassCard>

      <MultiplicityBadge className="left-[160px] top-[260px]">1</MultiplicityBadge>
      <MultiplicityBadge className="right-[180px] top-[260px]">
        0..*
      </MultiplicityBadge>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

function Marker({
  type,
  children,
}: {
  type: "attr" | "method";
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        type === "method" ? "text-primary-container" : "text-tertiary-fixed-dim"
      }
    >
      {children}
    </span>
  );
}

function ClassCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`class-card z-10 w-48 rounded border border-outline-variant/20 bg-surface-container-lowest ${className}`}
    >
      <div className="rounded-t border-b border-outline-variant bg-surface-container-high px-3 py-2">
        <h3 className="font-mono text-sm font-semibold text-on-surface">
          {title}
        </h3>
      </div>
      <div className="flex flex-col gap-2 p-3 font-mono text-xs text-on-surface-variant">
        {children}
      </div>
    </div>
  );
}

function MultiplicityBadge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`absolute z-20 bg-amber-lock px-1 font-mono text-[10px] font-bold leading-3 tracking-wider text-on-primary ${className}`}
    >
      {children}
    </div>
  );
}