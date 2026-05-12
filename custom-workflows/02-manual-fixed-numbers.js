import fs from 'fs';

// ── 헬퍼 함수들 ──────────────────────────────────────────
const toDateStr = (date) => {
  const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

const sendTelegram = async (msg) => {
  try {
    const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim(); const tgChatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (tgToken && tgChatId) await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: tgChatId, text: msg }) });
  } catch(e) {}
};

const getDateRange = () => {
  const rangeEnv = (process.env.INPUT_DATE_RANGE || '').trim();
  if (rangeEnv && rangeEnv.includes('_')) { const [start, end] = rangeEnv.split('_'); return { start, end }; }
  const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 90);
  return { start: toDateStr(start), end: toDateStr(end) };
};

const fetchPurchaseList = async (page) => {
  const { start, end } = getDateRange();
  try { const res = await page.goto(`https://www.dhlottery.co.kr/mypage/selectMyLotteryledger.do?srchStrDt=${start}&srchEndDt=${end}&sort=&ltGdsCd=LO40&winResult=&lramSmam=&pageNum=1&recordCountPerPage=50&_=${Date.now()}`, { waitUntil: 'networkidle', timeout: 15000 }); return JSON.parse(await res.text())?.data?.list ?? []; } catch (e) { return []; }
};

const fetchTicketDetail = async (page, ntslOrdrNo, barcd) => {
  const { start, end } = getDateRange();
  try { const res = await page.goto(`https://www.dhlottery.co.kr/mypage/lotto645TicketDetail.do?ntslOrdrNo=${ntslOrdrNo}&srchStrDt=${start}&srchEndDt=${end}&barcd=${barcd}&_=${Date.now()}`, { waitUntil: 'networkidle', timeout: 15000 }); const json = JSON.parse(await res.text()); return json?.data?.success ? json.data.ticket : null; } catch (e) { return null; }
};

const fetchWinNumbers = async (page, round) => {
  try { const res = await page.goto(`https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`, { waitUntil: 'networkidle', timeout: 10000 }); const json = JSON.parse(await res.text()); return json.returnValue === 'success' ? { round: json.drwNo, date: json.drwNoDate, numbers: [json.drwtNo1, json.drwtNo2, json.drwtNo3, json.drwtNo4, json.drwtNo5, json.drwtNo6], bonus: json.bnusNo, prize1: json.firstWinamnt, prize1Cnt: json.firstPrzwnerCo } : null; } catch (e) { return null; }
};

const calcRank = (myNums, winNums, bonusNum) => { const match = myNums.filter(n => winNums.includes(n)).length; const hasBonus = myNums.includes(bonusNum); if (match === 6) return 1; if (match === 5 && hasBonus) return 2; if (match === 5) return 3; if (match === 4) return 4; if (match === 3) return 5; return 0; };
const RANK_LABEL = { 1:'1등 🏆', 2:'2등 🥈', 3:'3등 🥉', 4:'4등', 5:'5등', 0:'낙첨' };

// ── 메인 로직 ───────────────────────────────────────────
export default async function(api) {
  const isScheduled = process.env.IS_SCHEDULED === 'true';
  const accMode = (process.env.INPUT_ACCOUNT_MODE || 'acc1').trim();
  const accName = accMode === 'acc2' ? '계정 2' : '계정 1';
  let inputEnv = (process.env.INPUT_LOTTO_NUMBERS || '').replace(/['"]/g, '').trim();

  let results = { balance1: "--", balance2: "--", history: [], ledger: [], reservation: null, last_run: "" };
  try { if (fs.existsSync('result.json')) results = Object.assign(results, JSON.parse(fs.readFileSync('result.json', 'utf8'))); } catch(e) {}

  if (inputEnv.startsWith("RESERVE_SET|")) {
    const parts = inputEnv.split("|");
    results.reservation = { isActive: true, type: parts[1], count: parseInt(parts[2]), endDate: parts[3], favs: parts[4] ? parts[4].split(";") : [] };
    results.last_run = new Date().toISOString(); 
    fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
    await sendTelegram(`🗓️ [장기 예약 성공]\n비서가 접수했습니다! 매주 월요일 오후 5시에 ${parts[2]}게임씩 구매하겠습니다.`);
    return { status: "success" };
  }
  
  if (inputEnv === "RESERVE_CANCEL") {
    results.reservation = null;
    results.last_run = new Date().toISOString(); 
    fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
    await sendTelegram(`🗑️ [장기 예약 취소]\n매주 월요일 오후 5시 구매 스케줄이 취소되었습니다.`);
    return { status: "success" };
  }

  if (isScheduled) {
    const res = results.reservation;
    if (!res || !res.isActive) return { status: "success" }; 
    const today = toDateStr(new Date());
    if (today > res.endDate) {
      if (accMode === 'acc1') {
        res.isActive = false; results.last_run = new Date().toISOString();
        fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
        await sendTelegram(`⚠️ [예약 만료]\n기한이 종료되어 오늘부터 자동 구매를 중단합니다.`);
      }
      return { status: "success" };
    }
    let myCount = accMode === 'acc1' ? Math.min(5, res.count) : Math.max(0, res.count - 5);
    if (myCount === 0) return { status: "success" };

    const generateSemiLocal = (s) => {
      const base = s ? s.split(",") : ["","","","","",""]; const fixed = base.map(n => parseInt(n)).filter(n => !isNaN(n));
      let pool = Array.from({length:45},(_,i)=>i+1).filter(n => !fixed.includes(n)).sort(()=>Math.random()-0.5).slice(0, 6-fixed.length).sort((a,b)=>a-b);
      return base.map(n => (n !== "" ? n : String(pool.shift()))).join(",");
    };
    let targetGames = [];
    for(let i=0; i<myCount; i++) {
      let seed = (res.type === 'fav' && res.favs.length > 0) ? res.favs[((accMode === 'acc2' ? 5 : 0) + i) % res.favs.length] : "";
      targetGames.push(generateSemiLocal(seed));
    }
    inputEnv = targetGames.join("_");
  }

  const page = api.page || (api.session ? api.session.page : null);
  if (!page) return { status: "fail", message: "브라우저 연결 실패" };

  let currentBalance = "0"; let finalStatus = "success"; let finalMessage = "작업 완료"; let purchasedGames = []; let ledgerData = [];

  try {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const res = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle', timeout: 30000 });
    const json = JSON.parse(await res.text());
    if (json?.data?.userMndp?.crntEntrsAmt !== undefined) currentBalance = String(json.data.userMndp.crntEntrsAmt);
  } catch (e) { finalStatus = "fail"; finalMessage = "잔액 조회 실패"; }

  if (finalStatus === "success" && inputEnv !== "SYNC_ONLY") {
    if (parseInt(currentBalance) >= 1000) {
      try {
        let targetNumbersArray = inputEnv.split(/[|_]/).map(group => group.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)));
        const validGames = targetNumbersArray.filter(game => game.length === 6 || game.length === 0);
        purchasedGames = validGames;
        if (api.purchaseManual) await api.purchaseManual(validGames.filter(g => g.length === 6));
        if (api.purchaseAuto) { const autoCount = validGames.filter(g => g.length === 0).length; if (autoCount > 0) await api.purchaseAuto(autoCount); }
        finalMessage = `${validGames.length}게임 구매 성공!`;
        const reRes = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle', timeout: 15000 });
        const reJson = JSON.parse(await reRes.text());
        if (reJson?.data?.userMndp?.crntEntrsAmt !== undefined) currentBalance = String(reJson.data.userMndp.crntEntrsAmt);
      } catch (err) { 
        // 💡 [수정] 통째로 지워졌던 상세 에러 메시지 복구!
        const failReason = await page.evaluate((internalError) => {
          const t = document.body.innerText || "";
          if (t.includes("구매 가능 시간이 아닙니다")) return "구매 시간 아님";
          if (t.includes("최대 5천원으로 제한")) return "한도 초과 (5천원)";
          if (t.includes("잔액이 부족")) return "예치금 부족";
          if (internalError.includes("시간")) return "구매 시간 아님";
          if (internalError.includes("제한")) return "한도 초과 (5천원)";
          return "결제 에러 (한도/오류)";
        }, err.message).catch(() => "구매 에러");
        finalStatus = "fail"; finalMessage = failReason; 
      }
    } else { finalStatus = "fail"; finalMessage = "예치금 부족"; }
  }

  if (accMode === 'acc2') results.balance2 = currentBalance; else results.balance1 = currentBalance;

  try {
    const purchaseList = await fetchPurchaseList(page);
    const uniqueOrders = []; const seenOrders = new Set();
    for (const item of purchaseList) { if (!seenOrders.has(item.ntslOrdrNo)) { seenOrders.add(item.ntslOrdrNo); uniqueOrders.push(item); } }
    for (const order of uniqueOrders) {
      const cached = results.ledger.find(t => t.ntslOrdrNo === order.ntslOrdrNo);
      if (cached && cached.drawed) { ledgerData.push(cached); continue; }
      const ticket = await fetchTicketDetail(page, order.ntslOrdrNo, order.gmInfo);
      if (!ticket) continue;
      let winInfo = null; if (ticket.drawed) winInfo = await fetchWinNumbers(page, ticket.game_round);
      const games = ticket.game_dtl.map(g => {
        let rank = g.rank; let rankLabel = '미추첨';
        if (ticket.drawed && winInfo) { rank = calcRank(g.num, winInfo.numbers, winInfo.bonus); rankLabel = RANK_LABEL[rank]; }
        return { idx: g.idx, type: g.type === 1 ? '수동' : '자동', numbers: g.num, rank: rank, rankLabel: rankLabel, amt: g.amt };
      });
      ledgerData.push({ ntslOrdrNo: order.ntslOrdrNo, buyDate: order.eltOrdrDt, round: ticket.game_round, drawDate: ticket.draw_date, drawed: ticket.drawed, winTotalAmt: ticket.win_total_amt, games: games, winInfo: winInfo });
    }
  } catch (e) {}

  if (inputEnv !== "SYNC_ONLY") {
    // 실패해도 이력에 남기도록 수정 (한도초과 확인용)
    results.history.unshift({ date: new Date().toISOString(), acc: accName, status: finalStatus, message: finalMessage, games: purchasedGames, isScheduled: isScheduled });
    if (results.history.length > 30) results.history = results.history.slice(0, 30);
  }
  const newOrderNos = new Set(ledgerData.map(t => t.ntslOrdrNo));
  const oldOnlyCache = results.ledger.filter(t => !newOrderNos.has(t.ntslOrdrNo));
  results.ledger = [...ledgerData, ...oldOnlyCache].sort((a, b) => new Date(b.buyDate) - new Date(a.buyDate)).slice(0, 200);
  
  results.last_run = new Date().toISOString(); 
  fs.writeFileSync('result.json', JSON.stringify(results, null, 2));

  let tgMsg = isScheduled ? `🗓️ [${accName} 자동 예약 결과]\n- 상태: ${finalMessage}\n- 잔액: ${Number(currentBalance).toLocaleString()}원`
              : (inputEnv === "SYNC_ONLY" ? `📡 [${accName} 동기화 완료]\n- 잔액: ${Number(currentBalance).toLocaleString()}원`
              : `${finalStatus === "success" ? "🎉" : "⚠️"} [${accName} 구매 결과]\n- 상태: ${finalMessage}\n- 잔액: ${Number(currentBalance).toLocaleString()}원`);
  await sendTelegram(tgMsg);

  return { status: finalStatus, balance: currentBalance };
}
