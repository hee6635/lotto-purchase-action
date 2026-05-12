import fs from 'fs';

// ── 날짜 헬퍼 ──────────────────────────────────────────────
const toDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

const getDateRange = () => {
  const rangeEnv = (process.env.INPUT_DATE_RANGE || '').trim();
  if (rangeEnv && rangeEnv.includes('_')) {
    const [start, end] = rangeEnv.split('_');
    return { start, end };
  }
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  return { start: toDateStr(start), end: toDateStr(end) };
};

// ── 당첨내역 조회 함수들 ────────────────────────────────────
const fetchPurchaseList = async (page) => {
  const { start, end } = getDateRange();
  const url = `https://www.dhlottery.co.kr/mypage/selectMyLotteryledger.do?srchStrDt=${start}&srchEndDt=${end}&sort=&ltGdsCd=LO40&winResult=&lramSmam=&pageNum=1&recordCountPerPage=50&_=${Date.now()}`;
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    const json = JSON.parse(await res.text());
    return json?.data?.list ?? [];
  } catch (e) { return []; }
};

const fetchTicketDetail = async (page, ntslOrdrNo, barcd) => {
  const { start, end } = getDateRange();
  const url = `https://www.dhlottery.co.kr/mypage/lotto645TicketDetail.do?ntslOrdrNo=${ntslOrdrNo}&srchStrDt=${start}&srchEndDt=${end}&barcd=${barcd}&_=${Date.now()}`;
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    const json = JSON.parse(await res.text());
    if (!json?.data?.success) return null;
    return json.data.ticket;
  } catch (e) { return null; }
};

const fetchWinNumbers = async (page, round) => {
  const url = `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`;
  try {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
    const json = JSON.parse(await res.text());
    if (json.returnValue !== 'success') return null;
    return {
      round: json.drwNo, date: json.drwNoDate, numbers: [json.drwtNo1, json.drwtNo2, json.drwtNo3, json.drwtNo4, json.drwtNo5, json.drwtNo6],
      bonus: json.bnusNo, prize1: json.firstWinamnt, prize1Cnt: json.firstPrzwnerCo,
    };
  } catch (e) { return null; }
};

const calcRank = (myNums, winNums, bonusNum) => {
  const match = myNums.filter(n => winNums.includes(n)).length;
  const hasBonus = myNums.includes(bonusNum);
  if (match === 6) return 1; if (match === 5 && hasBonus) return 2;
  if (match === 5) return 3; if (match === 4) return 4;
  if (match === 3) return 5; return 0;
};

const RANK_LABEL = { 1:'1등 🏆', 2:'2등 🥈', 3:'3등 🥉', 4:'4등', 5:'5등', 0:'낙첨' };

// ── 메인 익스포트 ───────────────────────────────────────────
export default async function(api) {
  const page = api.page || (api.session ? api.session.page : null);
  if (!page) return { status: "fail", message: "조종기 연결 실패" };

  const accMode = (process.env.INPUT_ACCOUNT_MODE || 'acc1').trim();
  const accName = accMode === 'acc2' ? '계정 2' : '계정 1';

  let currentBalance = "0";
  let finalStatus = "success";
  let finalMessage = "작업 완료";
  let purchasedGames = [];
  let ledgerData = [];

  // 1. 잔액 조회 (구매 전)
  try {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const res = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle', timeout: 30000 });
    const json = JSON.parse(await res.text());
    if (json?.data?.userMndp?.crntEntrsAmt !== undefined) currentBalance = String(json.data.userMndp.crntEntrsAmt);
    else throw new Error("JSON 구조 오류");
  } catch (e) {
    finalStatus = "fail"; finalMessage = "잔액 조회 실패";
  }

  let inputEnv = (process.env.INPUT_LOTTO_NUMBERS || '').replace(/['"]/g, '').trim();

  // 2. 구매 or 동기화
  if (finalStatus === "success") {
    if (inputEnv === "SYNC_ONLY") {
      finalMessage = "동기화 완료";
    } else if (parseInt(currentBalance) >= 1000) {
      try {
        let targetNumbersArray = inputEnv ? inputEnv.split(/[|_]/).map(group => group.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n))) : [[]];
        const validGames = targetNumbersArray.filter(game => game.length === 6 || game.length === 0);
        purchasedGames = validGames;
        
        if (api.purchaseManual) await api.purchaseManual(validGames.filter(g => g.length === 6));
        if (api.purchaseAuto) {
          const autoCount = validGames.filter(g => g.length === 0).length;
          if (autoCount > 0) await api.purchaseAuto(autoCount);
        }
        finalMessage = `${validGames.length}게임 구매 성공!`;
        
        // 💡 [기술자님 로직 적용] 구매 후, 뺄셈 대신 "실제 동행복권 서버에서 잔액을 한 번 더 조회" 합니다!
        try {
          console.log("💰 구매 완료! 갱신된 잔액을 서버에서 다시 가져옵니다...");
          const reRes = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle', timeout: 15000 });
          const reJson = JSON.parse(await reRes.text());
          if (reJson?.data?.userMndp?.crntEntrsAmt !== undefined) {
            currentBalance = String(reJson.data.userMndp.crntEntrsAmt);
            console.log(`💰 실제 남은 잔액: ${currentBalance}원`);
          }
        } catch (e) {
          console.log("⚠️ 구매 후 잔액 갱신 조회 실패 (하지만 구매는 정상처리됨)");
        }

      } catch (err) {
        const failReason = await page.evaluate((internalError) => {
          const t = document.body.innerText;
          if (t.includes("구매 가능 시간이 아닙니다")) return "구매 가능 시간 아님 (06~24시)";
          if (t.includes("최대 5천원으로 제한")) return "이번 주 구매 한도 초과";
          if (t.includes("잔액이 부족")) return "예치금 잔액 부족";
          if (internalError.includes("시간")) return "구매 가능 시간 아님";
          return internalError.split('\n')[0];
        }, err.message).catch(() => err.message);
        finalStatus = "fail"; finalMessage = failReason;
      }
    } else {
      finalStatus = "fail"; finalMessage = "예치금 부족";
    }
  }

  // 3. 기존 데이터 불러오기
  let oldLedger = [];
  let historyLog = [];
  let b1 = "--";
  let b2 = "--";

  try {
    if (fs.existsSync('result.json')) {
      const old = JSON.parse(fs.readFileSync('result.json', 'utf8'));
      if (old.ledger) oldLedger = old.ledger;
      if (old.history) historyLog = old.history;
      if (old.balance1) b1 = old.balance1;
      if (old.balance2) b2 = old.balance2;
    }
  } catch (e) {}

  if (accMode === 'acc2') b2 = currentBalance; else b1 = currentBalance;

  // 4. 당첨내역 조회 (캐시 기반 누적)
  try {
    const purchaseList = await fetchPurchaseList(page);
    const uniqueOrders = [];
    const seenOrders = new Set();
    for (const item of purchaseList) {
      if (!seenOrders.has(item.ntslOrdrNo)) { seenOrders.add(item.ntslOrdrNo); uniqueOrders.push(item); }
    }
    for (const order of uniqueOrders) {
      const cached = oldLedger.find(t => t.ntslOrdrNo === order.ntslOrdrNo);
      if (cached && cached.drawed) { ledgerData.push(cached); continue; }

      const ticket = await fetchTicketDetail(page, order.ntslOrdrNo, order.gmInfo);
      if (!ticket) continue;

      let winInfo = null;
      if (ticket.drawed) winInfo = await fetchWinNumbers(page, ticket.game_round);

      const games = ticket.game_dtl.map(g => {
        let rank = g.rank; let rankLabel = '미추첨';
        if (ticket.drawed && winInfo) {
          rank = calcRank(g.num, winInfo.numbers, winInfo.bonus);
          rankLabel = RANK_LABEL[rank];
        }
        return { idx: g.idx, type: g.type === 1 ? '수동' : '자동', numbers: g.num, rank: rank, rankLabel: rankLabel, amt: g.amt };
      });
      ledgerData.push({ ntslOrdrNo: order.ntslOrdrNo, buyDate: order.eltOrdrDt, round: ticket.game_round, drawDate: ticket.draw_date, drawed: ticket.drawed, winTotalAmt: ticket.win_total_amt, games: games, winInfo: winInfo });
    }
  } catch (e) {}

  // 5. 저장 (Merge)
  if (inputEnv !== "SYNC_ONLY" && finalStatus === "success") {
    historyLog.unshift({ date: new Date().toISOString(), acc: accName, status: finalStatus, message: finalMessage, games: purchasedGames });
    if (historyLog.length > 30) historyLog = historyLog.slice(0, 30);
  }

  const newOrderNos = new Set(ledgerData.map(t => t.ntslOrdrNo));
  const oldOnlyCache = oldLedger.filter(t => !newOrderNos.has(t.ntslOrdrNo));
  const mergedLedger = [...ledgerData, ...oldOnlyCache].sort((a, b) => new Date(b.buyDate) - new Date(a.buyDate)).slice(0, 200);

  fs.writeFileSync('result.json', JSON.stringify({ status: finalStatus, message: finalMessage, balance1: b1, balance2: b2, last_run: new Date().toISOString(), history: historyLog, ledger: mergedLedger }, null, 2));

  // 6. 📨 텔레그램 발송
  try {
      const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
      const tgChatId = process.env.TELEGRAM_CHAT_ID?.trim();
      if (tgToken && tgChatId) {
          let tgMessage = (inputEnv === "SYNC_ONLY") 
              ? `📡 [${accName} 조회 완료]\n- 현재 잔액: ${Number(currentBalance).toLocaleString()}원`
              : `${finalStatus === "success" ? "🎉" : "⚠️"} [${accName} 구매 결과]\n- 상태: ${finalMessage}\n- 현재 잔액: ${Number(currentBalance).toLocaleString()}원`;

          await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: tgChatId, text: tgMessage }) });
      }
  } catch(e) {}

  return { status: finalStatus, balance: currentBalance };
}
