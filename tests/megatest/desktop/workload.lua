-- tests/megatest/desktop/workload.lua — mega-test W1/W2/W3 na Mudlet desktop.
--
-- Odpalany z profilu "megatest" jednolinijkowym skryptem profilu:
--   dofile("/abs/sciezka/repo/tests/megatest/desktop/workload.lua")
-- (jednorazowy setup — patrz tests/megatest/README.md). Cala logika jest tu,
-- wersjonowana w repo; profil jest tylko niemym posrednikiem.
--
-- Wejscie: manifest z gen_manifest.mjs (sciezka w MEGATEST_MAN).
-- Wyjscie: $MEGATEST_OUT/results_desktop.jsonl (1 wiersz = 1 przebieg),
--          $MEGATEST_OUT/desktop.done (marker konca) albo desktop.error.
--
-- Mierzymy OSOBNO: load (W1: loadMap = restore+audit+init2D — pelna cena
-- uzytkownika), pathfinding (W2: getPath — TAstar + budowa grafu przy
-- pierwszym zapytaniu po loadzie, koszt realny), search (W3: searchRoom,
-- pelny skan nazw) i iteracje (W3b: getRooms). Czas: os.clock() (CPU)
-- oraz getEpoch() (sciana) dla loadu.

local MAN_PATH = os.getenv("MEGATEST_MAN")
local OUT_DIR = os.getenv("MEGATEST_OUT")

local function die(msg)
  if OUT_DIR then
    local f = io.open(OUT_DIR .. "/desktop.error", "w")
    if f then f:write(tostring(msg) .. "\n") f:close() end
  end
  closeMudlet()
end

if not MAN_PATH or not OUT_DIR then
  -- Brak env = skrypt zaladowal sie w GUI (np. przy zapisie w edytorze),
  -- NIE w tescie. Nie zamykamy wtedy Mudleta — tylko informacja na konsoli.
  echo("\n[megatest] workload.lua zaladowany poza testem (brak MEGATEST_MAN/MEGATEST_OUT) — pomiar odpalaj wylacznie przez run_desktop.sh\n")
  return
end

-- Marker zaladowania: dofile w profilu strzelil, env jest (zanim cokolwiek
-- innego mogloby sie wywalic — rozdziela "skrypt nie zaladowany" od
-- "skrypt zaladowany, ale event nie przyszedl").
local lf = io.open(OUT_DIR .. "/workload_loaded.txt", "w")
if lf then lf:write("loaded\n") lf:close() end

local okMan, man = pcall(dofile, MAN_PATH)
if not okMan or type(man) ~= "table" or type(man.ladder) ~= "table" then
  die("manifest nieczytalny: " .. tostring(man))
  return
end

local function countKeys(t)
  local n = 0
  for _ in pairs(t) do n = n + 1 end
  return n
end

local allRows = {}   -- kopie wszystkich wierszy; na koniec lądują w results_desktop.json

local function writeRow(f, item, run, ok, rooms, loadCpuMs, loadWallMs, pathMs, pathFound, searchMs, searchHits, iterMs)
  local line = string.format(
    '{"file":"%s","run":%d,"ok":%s,"rooms":%d,"load_ms":%.1f,"load_wall_ms":%.1f,"path_ms":%.1f,"path_found":%d,"search_ms":%.1f,"search_hits":%d,"iter_ms":%.1f}',
    item.name, run, ok and "true" or "false", rooms,
    loadCpuMs, loadWallMs, pathMs, pathFound, searchMs, searchHits, iterMs)
  f:write(line .. "\n")
  f:flush()
  table.insert(allRows, line)
end

local function benchRun(f, item, run)
  -- W1: wczytanie mapy (.dat, binarny format Mudleta).
  local w0 = getEpoch()
  local c0 = os.clock()
  local ok = loadMap(item.dat)
  local c1 = os.clock()
  local w1 = getEpoch()
  if not ok then
    writeRow(f, item, run, false, 0, (c1 - c0) * 1000, (w1 - w0) * 1000, 0, 0, 0, 0, 0)
    return
  end

  -- W2: pathfinding na deterministycznych parach z manifestu.
  local p0 = os.clock()
  local found = 0
  for _, p in ipairs(item.pairs) do
    if getPath(p[1], p[2]) then found = found + 1 end
  end
  local p1 = os.clock()

  -- W3: przeszukanie (searchRoom = pelny skan nazw, case-insensitive).
  local s0 = os.clock()
  local hits = 0
  for _, q in ipairs(man.search_terms) do
    local r = searchRoom(q)
    if type(r) == "table" then hits = hits + countKeys(r) end
  end
  local s1 = os.clock()

  -- W3b: pelna iteracja po pokojach (getRooms buduje tablice id->nazwa).
  local i0 = os.clock()
  local all = getRooms()
  local rooms = countKeys(all)
  local i1 = os.clock()

  writeRow(f, item, run, true, rooms,
    (c1 - c0) * 1000, (w1 - w0) * 1000,
    (p1 - p0) * 1000, found,
    (s1 - s0) * 1000, hits,
    (i1 - i0) * 1000)
end

local function runAll()
  local f, err = io.open(OUT_DIR .. "/results_desktop.jsonl", "w")
  if not f then die("nie moge pisac do " .. OUT_DIR .. ": " .. tostring(err)) return end
  for _, item in ipairs(man.ladder) do
    for run = 1, man.runs do
      local okRun, runErr = xpcall(function() benchRun(f, item, run) end, debug.traceback)
      if not okRun then
        local line = string.format('{"file":"%s","run":%d,"error":%s}',
          item.name, run, string.format("%q", tostring(runErr)))
        f:write(line .. "\n")
        f:flush()
        table.insert(allRows, line)
      end
    end
  end
  f:close()
  local jf = io.open(OUT_DIR .. "/results_desktop.json", "w")
  if jf then jf:write("[\n" .. table.concat(allRows, ",\n") .. "\n]\n") jf:close() end
  local done = io.open(OUT_DIR .. "/desktop.done", "w")
  if done then done:write("ok\n") done:close() end
  closeMudlet()
end

-- sysLoadEvent: argument "1" = swiezo zaladowany profil (mudlet.cpp:5188),
-- "0" = resetProfile (Host.cpp:1033) — interesuje nas tylko swiezy load.
-- tempTimer daje petli Qt dojsc do siebie po starcie, zanim wejdziemy
-- w ciezkie loady.
local function onSysLoad(_, fresh)
  -- sysLoadEvent: w TEvent drugi argument ma typ ARGUMENT_TYPE_BOOLEAN, wiec
  -- callEventHandler robi lua_pushboolean — w Lua przychodzi BOOLEAN
  -- (true = swiezy load, mudlet.cpp:5188; false = resetProfile, Host.cpp),
  -- a NIE string "1"/"0". Akceptujemy obie formy dla odpornosci na starsze
  -- wersje Mudleta.
  if fresh == true or fresh == "1" then
    -- Marker diagnostyczny: event doszedl (widac tez, jakiego typu byl argument).
    local mf = io.open(OUT_DIR .. "/sysload_fired.txt", "w")
    if mf then mf:write(type(fresh) .. ":" .. tostring(fresh) .. "\n") mf:close() end
    tempTimer(2, runAll)
  end
end

registerAnonymousEventHandler("sysLoadEvent", onSysLoad)
