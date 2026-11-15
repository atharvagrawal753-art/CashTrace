// C#: mule-graph engine - hop analysis & velocity scoring
var app = WebApplication.CreateBuilder(args).Build();
app.Urls.Add("http://127.0.0.1:8005");
app.MapGet("/health", () => new { ok = true });
app.MapPost("/graph", (Req r) => {
    var h = r.Hops; int n = h.Count;
    double span = n > 0 ? h.Max(x => x.Minute) - h.Min(x => x.Minute) : 0;
    double vel = span > 0 ? Math.Round(n / span * 60, 2) : 0;
    double risk = Math.Min(1, 0.2 + n * 0.12 + vel * 0.05);
    return new { hops = n, accounts = h.Select(x => x.To).Distinct().Count(), span_min = span, hops_per_hour = vel, mule_risk = Math.Round(risk, 2), last_hop = n > 0 ? h[^1].From : null };
});
app.Run();
record Hop(string From, string To, double Amount, double Minute);
record Req(List<Hop> Hops);
