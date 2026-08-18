import { trpc } from "@/lib/trpc";
import { ArrowUpRight, Boxes, ClipboardList, Clock3, Truck } from "lucide-react";

const metricDefinitions = [
  { key: "openOrders", label: "Pedidos em aberto", icon: ClipboardList, suffix: "pedidos", tone: "blue" },
  { key: "stockLevel", label: "Nível de estoque", icon: Boxes, suffix: "unidades", tone: "pink" },
  { key: "pendingDeliveries", label: "Entregas pendentes", icon: Truck, suffix: "entregas", tone: "blue" },
  { key: "averageLeadTime", label: "Lead time médio", icon: Clock3, suffix: "dias", tone: "pink" },
] as const;

export default function Dashboard() {
  const { data, isLoading } = trpc.logistics.dashboard.useQuery();

  return (
    <div className="mx-auto max-w-[1440px]">
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-8 text-white sm:px-9 sm:py-11">
        <span className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#9fc7ea] opacity-90" />
        <span className="absolute bottom-[-88px] right-[18%] h-48 w-48 rounded-[40%] bg-[#eab6c6] opacity-90" />
        <span className="absolute bottom-10 right-9 h-12 w-12 rotate-12 rounded-md border border-white/30" />
        <div className="relative max-w-2xl">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#b8d5ef]">Visão operacional</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.055em] sm:text-5xl">Supply chain em movimento.</h1>
          <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-slate-300 sm:text-base">Acompanhe pedidos, disponibilidade de estoque, entregas e prazos em um único lugar.</p>
        </div>
      </section>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricDefinitions.map(metric => {
          const Icon = metric.icon;
          const value = data?.[metric.key] ?? 0;
          return (
            <article className="sc-surface min-h-44 p-5" key={metric.key}>
              <span className={`absolute -right-5 -top-6 h-20 w-20 rounded-full opacity-70 ${metric.tone === "blue" ? "bg-[#c8e0f3]" : "bg-[#f1ccd7]"}`} />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <p className="max-w-[11rem] text-sm font-semibold leading-5 text-slate-600">{metric.label}</p>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm"><Icon className="h-4 w-4" /></span>
                </div>
                <div className="mt-7">
                  <p className="text-4xl font-extrabold tracking-[-0.06em] text-slate-950">{isLoading ? "—" : value}</p>
                  <p className="mt-2 flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500"><ArrowUpRight className="h-3.5 w-3.5" /> {metric.suffix}</p>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
