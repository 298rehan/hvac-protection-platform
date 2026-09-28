import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="text-lg font-bold tracking-tight text-brand-900">Summit Air</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
              Residential HVAC maintenance and protection plans for homeowners across
              Florida, Texas, Arizona and California. Plan availability and pricing vary
              by service region.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900">Plans</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <Link href="/plans" className="hover:text-brand-700">
                  Compare plans
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-brand-700">
                  Create an account
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-brand-700">
                  Member sign in
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-900">Service hours</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Mon to Fri: 7:00 AM to 7:00 PM</li>
              <li>Saturday: 8:00 AM to 4:00 PM</li>
              <li>Emergency line: 24/7 for Complete members</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-200 pt-6">
          <p className="text-xs leading-relaxed text-slate-500">
            &copy; {year} Summit Air Protection Plans.{" "}
            <strong>Demonstration project.</strong> Summit Air is a fictional company; all
            plans, prices and customer records are sample data. Checkout is simulated and
            no payment is ever processed.
          </p>
        </div>
      </div>
    </footer>
  );
}
