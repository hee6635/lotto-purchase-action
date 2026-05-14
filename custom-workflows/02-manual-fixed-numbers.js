import fs from 'fs';

// ── 1. 헬퍼 함수 ──────────────────────────────────────────
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

// 💡 [버그 수정 완료] 콤마(,) 연산 시 에러를 유발하던 text= 구문을 제거하고 최신 :has-text() 구문으로 교체했습니다.
async function autoRechargeOrder(page, accName) {
  try {
    console.log(`[${accName}] 예치금 충전 페이지 진입...`);
    await page.goto('https://www.dhlottery.co.kr/payment.do?method=recharge', { waitUntil: 'networkidle' });
    
    // 1. 케이뱅크 버튼 선택
    const kbankRadio = page.locator('input[value="03"], #rechargeWayClsfCd2, label:has-text("케이뱅크")').first();
    await kbankRadio.click({ timeout: 5000 });
    
    // 2. 5,000원 버튼 선택
    const amtRadio = page.locator('input[value="5000"], label:has-text("5,000원"), label:has-text("5,000")').first();
    await amtRadio.click({ timeout: 5000 });
    
    // 3. 충전하기(확인) 버튼 클릭
    const submitBtn = page.locator('input[value="확인"], button:has-text("확인"), .btn_common.mid.blu').first();
    await submitBtn.click({ timeout: 5000 });
    
    await page.waitForTimeout(3000);
    return true;
  } catch (e) {
    console.error("충전 주문 생성 실패 원인:", e);
    return false;
  }
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
      date: json.drwNoDate, 
      numbers: [json.drwtNo1, json.drwtNo2, json.drwtNo3, json.drwtNo4, json.drwtNo5, json.drwtNo6], 
      bonus: json.bnusNo, 
      prize1: json.firstWinamnt, 
      prize1Cnt: json.firstPrzwnerCo 
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

// ── 2. 메인 로직 ───────────────────────────────────────────
export default async function(api) {
  const isScheduled = process.env.IS_SCHEDULED === 'true';
  const scheduleCommand = (process.env.INPUT_COMMAND || 'PURCHASE_AUTO').trim();
  const inputEnv = (process.env.INPUT_LOTTO_NUMBERS || '').replace(/['"]/g, '').trim();
  
  const accMode = (process.env.INPUT_ACCOUNT_MODE || 'acc1').trim();
  const displayAccName = accMode === 'acc2' ? '계정 2' : '계정 1'; 

  let results = { balance1: "--", balance2: "--", history: [], ledger: [], reservation: null, last_run: "" };
  try { 
    if (fs.existsSync('result.json')) results = Object.assign(results, JSON.parse(fs.readFileSync('result.json', 'utf8'))); 
  } catch(e) {}

  // ── [A] 충전 예약 기능 테스트 시동 모드 ──
  if (inputEnv === "RECHARGE_TEST") {
    console.log(`[${displayAccName}] ⚡ 충전 예약 기능 테스트 시동`);
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "브라우저 연결 실패" };
    
    const success = await autoRechargeOrder(page, displayAccName);
    if (success) {
      await sendTelegram(`⚡ [${displayAccName}] 예치금 충전 예약 테스트 성공!\n로봇이 동행복권 웹사이트에서 케이뱅크 5,000원 신청 단계를 오차 없이 클릭했습니다.`);
    } else {
      await sendTelegram(`❌ [${displayAccName}] 예치금 충전 예약 테스트 실패 (셀렉터 점검 필요)`);
    }
    return { status: "success" };
  }

  // ── [B] 앱(UI) 명령어 처리 (예약 설정/취소) ──
  if (inputEnv && inputEnv !== "SYNC_ONLY" && !inputEnv.includes("_")) {
    if (inputEnv.startsWith("RESERVE_SET|")) {
      const parts = inputEnv.split("|");
      results.reservation = { isActive: true, targetMode: accMode, type: parts[1], count: parseInt(parts[2]), endDate: parts[3], favs: parts[4] ? parts[4].split(";") : [] };
      results.last_run = new Date().toISOString(); 
      fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
      await sendTelegram(`🗓️ [예약 성공]\n- 대상: ${accMode === 'both' ? '계정 모두' : displayAccName}\n- 수량: ${parts[2]}게임\n비서가 접수했습니다!`);
      return { status: "success" };
    }
    if (inputEnv === "RESERVE_CANCEL") {
      results.reservation = null;
      results.last_run = new Date().toISOString(); 
      fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
      await sendTelegram(`🗑️ [예약 취소]\n매주 구매 스케줄이 취소되었습니다.`);
      return { status: "success" };
    }
  }

  // ── 브라우저 세팅 및 잔액 조회 ──
  const page = api.page || (api.session ? api.session.page : null);
  if (!page) return { status: "fail", message: "브라우저 연결 실패" };

  let currentBalance = "0"; 
  try {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const res = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle', timeout: 30000 });
    const json = JSON.parse(await res.text());
    if (json?.data?.userMndp?.crntEntrsAmt !== undefined) currentBalance = String(json.data.userMndp.crntEntrsAmt);
  } catch (e) { 
    return { status: "fail", message: "잔액 조회 실패" }; 
  }
  
  if (accMode === 'acc2') results.balance2 = currentBalance; else results.balance1 = currentBalance;

  // ── [C] 스케줄: 잔액 파수꾼 (월요일 19:00) ──
  if (isScheduled && scheduleCommand === 'CHECK_BALANCE') {
    console.log(`[${displayAccName}] 🌃 저녁 잔액 파수꾼 점검`);
    if (parseInt(currentBalance) < 5000) {
      await sendTelegram(`🚨 [${displayAccName} 잔액 경고]\n오늘 자동이체가 실패한 것 같습니다!\n현재 잔액: ${Number(currentBalance).toLocaleString()}원 (확인 필요)`);
    }
    results.last_run = new Date().toISOString();
    fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
    return { status: "success", balance: currentBalance };
  }

  // ── [D] 구매 준비 로직 ──
  let isBuyAction = false;
  let targetGamesStr = "";
  let finalStatus = "success"; 
  let finalMessage = "작업 완료"; 
  let purchasedGames = []; 

  if (inputEnv === "SYNC_ONLY" || (isScheduled && scheduleCommand === 'CHECK_WIN')) {
    isBuyAction = false;
  } else {
    isBuyAction = true;
    if (isScheduled && scheduleCommand === 'PURCHASE_AUTO') {
      const res = results.reservation;
      if (!res || !res.isActive) return { status: "success" }; 
      
      const today = toDateStr(new Date());
      if (today > res.endDate) {
        if (res.targetMode === 'both' || res.targetMode === accMode) {
          res.isActive = false; results.last_run = new Date().toISOString(); fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
          await sendTelegram(`⚠️ [예약 만료] 기한이 종료되어 자동 구매를 중단합니다.`);
        }
        return { status: "success" };
      }
      if (res.targetMode !== 'both' && res.targetMode !== accMode) return { status: "success" }; 
      
      let myCount = res.targetMode === 'both' ? (accMode === 'acc1' ? Math.min(5, res.count) : Math.max(0, res.count - 5)) : res.count;
      if (myCount === 0) return { status: "success" };

      const generateSemiLocal = (s) => {
        const base = s ? s.split(",") : ["","","","","",""]; const fixed = base.map(n => parseInt(n)).filter(n => !isNaN(n));
        let pool = Array.from({length:45},(_,i)=>i+1).filter(n => !fixed.includes(n)).sort(()=>Math.random()-0.5).slice(0, 6-fixed.length).sort((a,b)=>a-b);
        return base.map(n => (n !== "" ? n : String(pool.shift()))).join(",");
      };
      
      let tGames = [];
      for(let i=0; i<myCount; i++) {
        let seed = (res.type === 'fav' && res.favs.length > 0) ? res.favs[((accMode === 'acc2' ? 5 : 0) + i) % res.favs.length] : "";
        tGames.push(generateSemiLocal(seed));
      }
      targetGamesStr = tGames.join("_");
    } else {
      targetGamesStr = inputEnv;
    }
  }

  // ── [E] 실제 구매 실행 및 월요 충전 연계 ──
  let orderNote = "";
  if (isBuyAction && targetGamesStr) {
    if (parseInt(currentBalance) >= 1000) {
      try {
        let targetNumbersArray = targetGamesStr.split(/[|_]/).map(group => group.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)));
        let validGames = targetNumbersArray.filter(game => game.length === 6);
        
        const maxAffordable = Math.floor(parseInt(currentBalance) / 1000);
        let skippedCount = 0;
        if (validGames.length > maxAffordable) {
            skippedCount = validGames.length - maxAffordable;
            validGames = validGames.slice(0, maxAffordable);
        }
        purchasedGames = validGames;
        
        if (api.purchaseManual && validGames.length > 0) {
          await api.purchaseManual(validGames);
          finalMessage = `${validGames.length}게임 구매 성공!`;
          if (skippedCount > 0) finalMessage += ` (예치금 부족으로 ${skippedCount}게임 제외됨)`;
        } else if (validGames.length === 0) {
          throw new Error("유효한 번호가 없습니다.");
        }
      } catch (err) { 
        finalStatus = "fail"; finalMessage = "구매 에러 (주간 한도초과 등)"; 
      }
    } else { 
      finalStatus = "fail"; finalMessage = "잔액 부족 (최소 1,000원 필요)"; 
    }

    if (isScheduled && scheduleCommand === 'PURCHASE_AUTO' && finalStatus === "success") {
      const orderSuccess = await autoRechargeOrder(page, displayAccName);
      if (orderSuccess) orderNote = "\n- [완료] 오늘 자동이체용 충전 신청 (5,000원)";
    }

    try {
      const reRes = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle', timeout: 15000 });
      const reJson = JSON.parse(await reRes.text());
      if (reJson?.data?.userMndp?.crntEntrsAmt !== undefined) currentBalance = String(reJson.data.userMndp.crntEntrsAmt);
      if (accMode === 'acc2') results.balance2 = currentBalance; else results.balance1 = currentBalance;
    } catch (e) {}

    results.history.unshift({ date: new Date().toISOString(), acc: displayAccName, status: finalStatus, message: finalMessage, games: purchasedGames, isScheduled: isScheduled });
    if (results.history.length > 30) results.history = results.history.slice(0, 30);
  }

  // ── [F] 장부 동기화 및 당첨 확인 ──
  let ledgerData = [];
  try {
    const purchaseList = await fetchPurchaseList(page);
    const uniqueOrders = []; const seenOrders = new Set();
    for (const item of purchaseList) { if (!seenOrders.has(item.ntslOrdrNo)) { seenOrders.add(item.ntslOrdrNo); uniqueOrders.push(item); } }
    
    for (const order of uniqueOrders) {
      const cached = results.ledger.find(t => t.ntslOrdrNo === order.ntslOrdrNo);
      if (cached && cached.drawed) { 
        if (!cached.acc) cached.acc = displayAccName; 
        ledgerData.push(cached); 
        continue; 
      }
      const ticket = await fetchTicketDetail(page, order.ntslOrdrNo, order.gmInfo);
      if (!ticket) continue;
      
      let winInfo = null; 
      if (ticket.drawed) winInfo = await fetchWinNumbers(page, ticket.game_round);
      
      const games = ticket.game_dtl.map(g => {
        let rank = g.rank; let rankLabel = '미추첨';
        if (ticket.drawed && winInfo) { rank = calcRank(g.num, winInfo.numbers, winInfo.bonus); rankLabel = RANK_LABEL[rank]; }
        return { idx: g.idx, type: g.type === 1 ? '수동' : '자동', numbers: g.num, rank: rank, rankLabel: rankLabel, amt: g.amt };
      });
      ledgerData.push({ acc: displayAccName, ntslOrdrNo: order.ntslOrdrNo, buyDate: order.eltOrdrDt, round: ticket.game_round, drawDate: ticket.draw_date, drawed: ticket.drawed, winTotalAmt: ticket.win_total_amt, games: games, winInfo: winInfo });
    }
  } catch (e) {}
  
  const newOrderNos = new Set(ledgerData.map(t => t.ntslOrdrNo));
  const oldOnlyCache = results.ledger.filter(t => !newOrderNos.has(t.ntslOrdrNo));
  results.ledger = [...ledgerData, ...oldOnlyCache].sort((a, b) => new Date(b.buyDate) - new Date(a.buyDate)).slice(0, 200);
  
  results.last_run = new Date().toISOString(); 
  fs.writeFileSync('result.json', JSON.stringify(results, null, 2));

  // ── [G] 텔레그램 메시지 발송 ──
  if (isScheduled && scheduleCommand === 'CHECK_WIN') {
    const todayStr = toDateStr(new Date());
    const todayWins = ledgerData.filter(t => t.drawed && t.winTotalAmt > 0 && t.acc === displayAccName && (t.drawDate.replace(/-/g, '') === todayStr || t.drawDate === todayStr));

    if (todayWins.length > 0) {
      let winMsg = `🎊 [${displayAccName} 축 당첨!!] 🎊`;
      todayWins.forEach(t => {
        winMsg += `\n제 ${t.round}회: ${t.winTotalAmt.toLocaleString()}원 당첨!`;
      });
      await sendTelegram(winMsg);
    }
    return { status: "success", balance: currentBalance };
  }

  if (isBuyAction) {
    if (isScheduled) {
      await sendTelegram suicide(`🗓️ [${displayAccName} 월요 구매] ${finalMessage}${orderNote}\n- 잔액: ${Number(currentBalance).toLocaleString()}원\n- 오후 7시에 잔액을 최종 점검합니다.`);
    } else {
      await sendTelegram(`${finalStatus === "success" ? "🎉" : "⚠️"} [${displayAccName} 즉시 구매]\n- 상태: ${finalMessage}\n- 잔액: ${Number(currentBalance).toLocaleString()}원`);
    }
  } else if (inputEnv === "SYNC_ONLY") {
    await sendTelegram(`📡 [${displayAccName} 동기화 완료]\n- 현재 잔액: ${Number(currentBalance).toLocaleString()}원`);
  }

  return { status: finalStatus, balance: currentBalance };
}
