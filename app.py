# Python: geo-temporal forecast engine (stdlib only). score = history * exp(-d^2 / 2 sigma^2(t))
import json, math, random
from http.server import BaseHTTPRequestHandler, HTTPServer
random.seed(11)
ATMS=[{"id":f"ATM-{i+1:02d}","lat":22.72+random.uniform(-.06,.06),"lng":75.86+random.uniform(-.06,.06),"h":random.uniform(.4,1)} for i in range(14)]
def predict(lat,lng,t,atms=None,n=5):
    sg=1.6+t*.9; out=[]
    for a in (atms or ATMS):
        dx=(a["lng"]-lng)*111*math.cos(math.radians(lat)); dy=(a["lat"]-lat)*111
        out.append((a,a.get("h",a.get("history",.5))*math.exp(-(dx*dx+dy*dy)/(2*sg*sg))))
    tot=sum(s for _,s in out) or 1
    out.sort(key=lambda x:-x[1])
    return {"sigma_km":round(sg,2),"top":[{"atm":a["id"],"lat":round(a["lat"],5),"lng":round(a["lng"],5),"prob":round(s/tot,3)} for a,s in out[:n]],"all":[{"atm":a["id"],"prob":round(s/tot,4)} for a,s in out]}
class H(BaseHTTPRequestHandler):
    def _j(self,o):
        b=json.dumps(o).encode(); self.send_response(200); self.send_header("Content-Type","application/json"); self.end_headers(); self.wfile.write(b)
    def do_GET(self): self._j({"ok":True})
    def do_POST(self):
        d=json.loads(self.rfile.read(int(self.headers.get("Content-Length",0))) or b"{}")
        self._j(predict(d.get("lat",22.7196),d.get("lng",75.8577),float(d.get("hours",1.5)),d.get("atms"),int(d.get("top",5))))
    def log_message(self,*a): pass
HTTPServer(("127.0.0.1",8001),H).serve_forever()
