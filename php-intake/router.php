<?php // PHP: complaint intake - validates and stores complaints (JSON file)
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { echo '{"ok":true}'; exit; }
$d = json_decode(file_get_contents('php://input'), true) ?: [];
$amt = (float)($d['amount'] ?? 0);
if ($amt <= 0) { http_response_code(422); echo '{"error":"amount required"}'; exit; }
$id = 'NCRP-' . date('Ymd') . '-' . random_int(1000, 9999);
$rec = ['id'=>$id,'city'=>$d['victim_city'] ?? 'NA','amount'=>$amt,'hops'=>count($d['hops'] ?? []),'ts'=>date('c')];
$f = __DIR__ . '/complaints.json';
$all = file_exists($f) ? json_decode(file_get_contents($f), true) : [];
$all[] = $rec; file_put_contents($f, json_encode($all, JSON_PRETTY_PRINT), LOCK_EX);
echo json_encode(['id'=>$id,'status'=>'ingested','amount'=>$amt]);
