// Java: risk ranking / urgency + intervention window
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.*;
public class Risk {
  public static void main(String[] a) throws Exception {
    HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 8003), 0);
    s.createContext("/", x -> {
      Map<String,Double> q = new HashMap<>();
      String qs = x.getRequestURI().getQuery();
      if (qs != null) for (String p : qs.split("&")) { String[] kv = p.split("="); q.put(kv[0], Double.parseDouble(kv[1])); }
      double conf = q.getOrDefault("conf", 0.0), h = q.getOrDefault("hours", 1.5);
      double urgency = Math.min(1, Math.max(0, 0.35 + conf * 1.2 + (2 - h) * 0.08));
      long win = Math.max(5, Math.round((2 - h) * 30 + 20));
      String lvl = urgency > .7 ? "CRITICAL" : urgency > .45 ? "HIGH" : "MEDIUM";
      byte[] b = String.format(Locale.US, "{\"urgency\":%.2f,\"level\":\"%s\",\"window_min\":%d}", urgency, lvl, win).getBytes();
      x.getResponseHeaders().add("Content-Type", "application/json");
      x.sendResponseHeaders(200, b.length); x.getResponseBody().write(b); x.close();
    });
    s.start();
  }
}
