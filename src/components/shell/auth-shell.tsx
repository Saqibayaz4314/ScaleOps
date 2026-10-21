export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="flex flex-col justify-between bg-ink px-8 py-10 text-chalk lg:px-14 lg:py-14">
        <div className="leading-none">
          <div className="text-[22px] font-semibold tracking-[0.04em]">SCALE</div>
          <div className="mt-0.5 text-[22px] font-semibold tracking-[0.04em] text-copper">/ OPS</div>
        </div>
        <div className="mt-16 max-w-md lg:mt-0">
          <p className="eyebrow !text-quiet">Operations / 01</p>
          <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em]">
            Observe the scaling. Change nothing.
          </h1>
          <p className="mt-4 text-[13.5px] leading-relaxed text-quiet">
            A read-only view of your EC2 Auto Scaling group, Application Load Balancer and CloudWatch
            telemetry. Capacity decisions stay with AWS; this console only reports what AWS reports.
          </p>
        </div>
        <p className="mono mt-16 text-[11px] text-quiet lg:mt-0">Your AWS keys are stored encrypted and never leave the server.</p>
      </section>
      <section className="flex items-center bg-paper px-6 py-12 lg:px-16">{children}</section>
    </div>
  );
}
