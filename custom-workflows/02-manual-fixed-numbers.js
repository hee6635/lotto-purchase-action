import fs from 'fs';

// ── 1. 계정별 고정 정보 설정 ──────────
const ACCOUNT_CONFIG = {
  acc1: {
    userId: "hee6635",
    vbankNum: "70103031239271",
    userName: "이희정"
  },
  acc2: {
    userId: "ic4000", 
    vbankNum: "70190086690895",
    userName: "오현지"
  }
};

// ── 2. 헬퍼 함수 ──────────────────────────
const toDateStr = (date) => {
  const y = date.getFullYear(); 
  const m = String(date.getMonth() + 1).padStart(2, '0'); 
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

const sendTelegram = async (msg) => {
  try {
    const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim(); 
    const tgChatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (tgToken && tgChatId) {
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ chat_id: tgChatId, text: msg }) 
      });
    }
  } catch(e) {}
};

// 💡 [네트워크 직통 엔진] 서버에 충전 신청 패킷 전송
async function autoRechargeOrder(page, accMode) {
  try {
    const config = ACCOUNT_CONFIG[accMode];
    const result = await page.evaluate(async (cfg) => {
      const now = new Date();
      const moid = now.toISOString().replace(/[-:T]/g, '').slice(0, 14) + Math.floor(Math.random() * 1000000).toString().padStart(7, '0');
      const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
      const expDate = tomorrow.toISOString().replace(/[-:T]/g, '').slice(0, 8);
      const url = `https://www.dhlottery.co.kr/mypage/kbankProcess.do?PayMethod=VBANK&GoodsName=%EB%B3%B5%EA%B6%8C%EC%98%88%EC%B9%98%EA%B8%88&Moid=${moid}&UserIP=127.0.0.1&MallUserID=${cfg.userId}&VbankExpDate=${expDate}&Amt=5000&VbankBankCode=089&VbankNum=${cfg.vbankNum}&FxVrAccountNo=${cfg.vbankNum}&VBankAccountName=%EB%8F%99%ED%96%89%EB%B3%B5%EA%B6%8C_${encodeURIComponent(cfg.userName)}&_=${Date.now()}`;
      const response = await fetch(url, { headers: { 'ajax': 'true' } });
      return await response.json();
    }, config);
    const resVO = result?.data?.resVO;
    if (resVO && (resVO.resultCode === "4120" || resVO.vbankNum)) return { success: true, account: resVO.vbankNum };
    return { success: false, error: "서버 응답 오류" };
  } catch (e) { return { success: false, error: e.message }; }
}

const getDateRange = () => {
  const rangeEnv = (process.env.INPUT_DATE_RANGE || '').trim();
  if (rangeEnv && rangeEnv.includes('_')) { 
    const [start, end] = rangeEnv.split('_'); 
    return { start, end }; 
  }
  const end = new Date(); 
  const start = new Date(); start.setDate(start.getDate() - 90);
  return { start: toDateStr(start), end: toDateStr(end) };
};

const fetchPurchaseList = async (page) => {
  const { start, end } = getDateRange();
  try { 
    const res = await page.goto(`https://www.dhlottery.co.kr/mypage/selectMyLotteryledger.do?srchStrDt=${start}&srchEndDt=${end}&sort=&ltGdsCd=LO40&winResult=&lramSmam=&pageNum=1&recordCountPerPage=50&_=${Date.now()}`, { waitUntil: 'networkidle', timeout: 15000 }); 
    return JSON.parse(await res.text())?.data?.list ?? []; 
  } catch (e) { return []; }
};

const fetchTicketDetail = async (page, ntslOrdrNo, barcd) => {
  const { start, end } = getDateRange();
  try { 
    const res = await page.goto(`https://www.dhlottery.co.kr/mypage/lotto645TicketDetail.do?ntslOrdrNo=${ntslOrdrNo}&srchStrDt=${start}&srchEndDt=${end}&barcd=${barcd}&_=${Date.now()}`, { waitUntil: 'networkidle', timeout: 15000 }); 
    const json = JSON.parse(await res.text()); 
    return json?.data?.success ? json.data.ticket : null; 
  } catch (e) { return null; }
};

const fetchWinNumbers = async (page, round) => {
  try { 
    const res = await page.goto(`https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${round}`, { waitUntil: 'networkidle', timeout: 10000 }); 
    const json = JSON.parse(await res.text()); 
    return json.returnValue === 'success' ? { 
      round: json.drwNo, 
      numbers: [json.drwtNo1, json.drwtNo2, json.drwtNo3, json.drwtNo4, json.drwtNo5, json.drwtNo6], 
      bonus: json.bnusNo 
    } : null; 
  } catch (e) { return null; }
};

const calcRank = (myNums, winNums, bonusNum) => { 
  const match = myNums.filter(n => winNums.includes(n)).length; 
  const hasBonus = myNums.includes(bonusNum); 
  if (match === 6) return 1; 
  if (match === 5 && hasBonus) return 2; 
  if (match === 5) return 3; 
  if (match === 4) return 4; 
  if (match === 3) return 5; 
  return 0; 
};
const RANK_LABEL = { 1:'1등 🏆', 2:'2등 🥈', 3:'3등 🥉', 4:'4등', 5:'5등', 0:'낙첨' };

// ── 4. 메인 엔진 ──────────────────────────────────────────────
export default async function(api) {
  const isScheduled = process.env.IS_SCHEDULED === 'true';
  const scheduleCommand = (process.env.INPUT_COMMAND || '').trim();
  const inputEnv = (process.env.INPUT_LOTTO_NUMBERS || '').replace(/['"]/g, '').trim();
  const accMode = (process.env.INPUT_ACCOUNT_MODE || 'acc1').trim();
  const displayAccName = accMode === 'acc2' ? '계정 2' : '계정 1'; 

  let results = { balance1: "--", balance2: "--", history: [], ledger: [], reservation: null, last_run: "" };
  try { if (fs.existsSync('result.json')) results = Object.assign(results, JSON.parse(fs.readFileSync('result.json', 'utf8'))); } catch(e) {}

  const page = api.page || (api.session ? api.session.page : null);
  if (!page) return { status: "fail", message: "브라우저 연결 실패" };

  // [A] 월요일 오전 07:00: 충전 전용 모드
  if (isScheduled && scheduleCommand === 'RECHARGE_ONLY') {
    const orderRes = await autoRechargeOrder(page, accMode);
    if (orderRes.success) await sendTelegram(`⚡ [${displayAccName} 충전 신청 완료] 케이뱅크 ${orderRes.account}\n입금 확인 후 저녁에 구매를 시작합니다.`);
    else await sendTelegram(`❌ [${displayAccName} 충전 신청 실패] 원인: ${orderRes.error}`);
    return { status: "success" };
  }

  // [B] 기본 정보 조회 (잔액 업데이트)
  let currentBalance = "0"; 
  try {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const res = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle' });
    const json = JSON.parse(await res.text());
    currentBalance = String(json?.data?.userMndp?.crntEntrsAmt || "0");
  } catch (e) {}
  if (accMode === 'acc2') results.balance2 = currentBalance; else results.balance1 = currentBalance;

  // [C] 수동 명령어 처리 (동기화 및 예약 설정)
  if (scheduleCommand === 'MANUAL' || !isScheduled) {
    if (inputEnv.startsWith("RESERVE_SET|")) {
      const p = inputEnv.split("|");
      results.reservation = { isActive: true, targetMode: accMode, type: p[1], count: parseInt(p[2]), endDate: p[3], favs: p[4] ? p[4].split(";") : [] };
      fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
      await sendTelegram(`🗓️ [예약 성공] ${displayAccName} 정기 구매 설정 완료.`);
      return { status: "success" };
    }
    if (inputEnv === "RESERVE_CANCEL") {
      results.reservation = null;
      fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
      await sendTelegram(`🗑️ [예약 취소] 정기 구매 중단.`);
      return { status: "success" };
    }
  }

  // [D] 구매 로직 분리 (수동 vs 스케줄)
  let isBuy = false; let targetGames = "";
  if (scheduleCommand === 'MANUAL' || !isScheduled) {
    if (inputEnv && inputEnv !== "SYNC_ONLY" && !inputEnv.startsWith("RESERVE_") && inputEnv !== "RECHARGE_TEST") {
      isBuy = true; targetGames = inputEnv;
    }
  } else if (isScheduled && scheduleCommand === 'PURCHASE_AUTO') {
    const res = results.reservation;
    if (res && res.isActive) {
      const today = toDateStr(new Date());
      if (today <= res.endDate && (res.targetMode === 'both' || res.targetMode === accMode)) {
        let myCount = res.targetMode === 'both' ? (accMode === 'acc1' ? Math.min(5, res.count) : Math.max(0, res.count - 5)) : res.count;
        if (myCount > 0) {
          const gen = (s) => {
            const base = s ? s.split(",") : ["","","","","",""]; const fixed = base.map(n => parseInt(n)).filter(n => !isNaN(n));
            let pool = Array.from({length:45},(_,i)=>i+1).filter(n => !fixed.includes(n)).sort(()=>Math.random()-0.5).slice(0, 6-fixed.length).sort((a,b)=>a-b);
            return base.map(n => (n !== "" ? n : String(pool.shift()))).join(",");
          };
          let tG = []; for(let i=0; i<myCount; i++) tG.push(gen((res.type === 'fav' && res.favs.length > 0) ? res.favs[((accMode === 'acc2' ? 5 : 0) + i) % res.favs.length] : ""));
          isBuy = true; targetGames = tG.join("_");
        }
      }
    }
  }

  // [E] 구매 실행
  if (isBuy && targetGames) {
    let finalStatus = "success"; let finalMessage = "작업 완료"; let purchasedGames = [];
    if (parseInt(currentBalance) >= 1000) {
      try {
        let targetNumbersArray = targetGames.split(/[|_]/).map(group => group.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)));
        let validGames = targetNumbersArray.filter(game => game.length === 6);
        const maxAffordable = Math.floor(parseInt(currentBalance) / 1000);
        if (validGames.length > maxAffordable) validGames = validGames.slice(0, maxAffordable);
        purchasedGames = validGames;
        if (api.purchaseManual && validGames.length > 0) {
          await api.purchaseManual(validGames);
          finalMessage = `${validGames.length}게임 구매 성공!`;
        }
      } catch (err) { finalStatus = "fail"; finalMessage = "구매 에러"; }
    } else { finalStatus = "fail"; finalMessage = "잔액 부족"; }

    // 구매 직후 잔액 갱신
    try {
      const reRes = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle' });
      const reJson = JSON.parse(await reRes.text());
      currentBalance = String(reJson?.data?.userMndp?.crntEntrsAmt || "0");
      if (accMode === 'acc2') results.balance2 = currentBalance; else results.balance1 = currentBalance;
    } catch (e) {}

    // 💡 기술자님 요청: 장부 다이어트 (최근 30개만 유지)
    results.history.unshift({ 
        date: new Date().toISOString(), 
        acc: displayAccName, 
        status: finalStatus, 
        message: finalMessage, 
        games: purchasedGames, 
        isScheduled: isScheduled 
    });
    results.history = results.history.slice(0, 30); 

    await sendTelegram(`${finalStatus === "success" ? "🎉" : "⚠️"} [${displayAccName} ${isScheduled ? '월요' : '즉시'} 구매]\n- 상태: ${finalMessage}\n- 잔액: ${Number(currentBalance).toLocaleString()}원`);
  }

  // [F] 장부 동기화 및 당첨 확인 (캐시 최적화)
  let ledgerData = [];
  try {
    const purchaseList = await fetchPurchaseList(page);
    const uniqueOrders = []; const seenOrders = new Set();
    for (const item of purchaseList) { if (!seenOrders.has(item.ntslOrdrNo)) { seenOrders.add(item.ntslOrdrNo); uniqueOrders.push(item); } }
    for (const order of uniqueOrders) {
      const cached = results.ledger.find(t => t.ntslOrdrNo === order.ntslOrdrNo);
      if (cached && cached.drawed) { if (!cached.acc) cached.acc = displayAccName; ledgerData.push(cached); continue; }
      const ticket = await fetchTicketDetail(page, order.ntslOrdrNo, order.gmInfo);
      if (!ticket) continue;
      let winInfo = ticket.drawed ? await fetchWinNumbers(page, ticket.game_round) : null;
      const games = ticket.game_dtl.map(g => {
        let rank = 0; if (ticket.drawed && winInfo) rank = calcRank(g.num, winInfo.numbers, winInfo.bonus);
        return { idx: g.idx, type: g.type === 1 ? '수동' : '자동', numbers: g.num, rank: rank, rankLabel: RANK_LABEL[rank] };
      });
      ledgerData.push({ acc: displayAccName, ntslOrdrNo: order.ntslOrdrNo, buyDate: order.eltOrdrDt, round: ticket.game_round, drawDate: ticket.draw_date, drawed: ticket.drawed, winTotalAmt: ticket.win_total_amt, games: games, winInfo: winInfo });
    }
  } catch (e) {}
  
  const newOrderNos = new Set(ledgerData.map(t => t.ntslOrdrNo));
  results.ledger = [...ledgerData, ...results.ledger.filter(t => !newOrderNos.has(t.ntslOrdrNo))].slice(0, 200);

  if (isScheduled && scheduleCommand === 'CHECK_WIN') {
    const todayStr = toDateStr(new Date());
    const wins = ledgerData.filter(t => t.drawed && t.winTotalAmt > 0 && t.acc === displayAccName && (t.drawDate.replace(/-/g, '') === todayStr || t.drawDate === todayStr));
    if (wins.length > 0) {
      let winMsg = `🎊 [${displayAccName} 당첨!!] 🎊`;
      wins.forEach(t => winMsg += `\n제 ${t.round}회: ${t.winTotalAmt.toLocaleString()}원!`);
      await sendTelegram(winMsg);
    }
  }

  if (inputEnv === "SYNC_ONLY") await sendTelegram(`📡 [${displayAccName} 동기화 완료] 잔액: ${Number(currentBalance).toLocaleString()}원`);
  results.last_run = new Date().toISOString(); 
  fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
  return { status: "success" };
}
