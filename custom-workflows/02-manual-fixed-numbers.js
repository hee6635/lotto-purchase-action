import fs from 'fs';

// ── 1. 헬퍼 함수 ──────────────────────────
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

// 💡 [초고속 강제 주입 로직] 버튼이든, 목록(Select)이든 0.1초 만에 값을 꽂아버립니다.
async function autoRechargeOrder(page, accName) {
  let popupLogs = [];
  try {
    console.log(`[${accName}] 예치금 충전 시퀀스 시작...`);
    
    // 팝업 무조건 '확인' 누르고 기록
    page.on('dialog', async dialog => { 
      popupLogs.push(dialog.message());
      try { await dialog.accept(); } catch(e) {} 
    });

    await page.goto('https://www.dhlottery.co.kr/payment.do?method=recharge', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000); // 렌더링 대기

    // 자바스크립트를 브라우저 심장부에 직접 꽂아서 실행 (타임아웃 발생 원천 차단)
    const injectResult = await page.evaluate(() => {
        let logs = [];
        try {
            // 1. 케이뱅크(가상계좌) 선택
            const kbankRadio = document.querySelector('input[value="03"]') || document.querySelector('#rechargeWayClsfCd2');
            if (kbankRadio) { kbankRadio.click(); logs.push("케이뱅크 체크"); }

            // 2. 금액 선택 (Select 박스인 경우 강제로 값 변경)
            let selectBox = null;
            document.querySelectorAll('select').forEach(sel => {
                if(sel.innerHTML.includes('5000') || sel.innerHTML.includes('5,000')) selectBox = sel;
            });
            
            if (selectBox) {
                selectBox.value = '5000';
                selectBox.dispatchEvent(new Event('change', { bubbles: true }));
                logs.push("목록에서 5,000원 선택");
            } else {
                // 혹시 라디오 버튼일 경우
                const amtRadio = document.querySelector('input[value="5000"]');
                if (amtRadio) { amtRadio.click(); logs.push("버튼 5,000원 클릭"); }
            }

            // 3. 확인/충전하기 버튼 클릭 (금액 세팅 후 0.5초 뒤 자동 클릭)
            const submitBtn = document.querySelector('.btn_common.mid.blu') || document.querySelector('#btnSubmit');
            if (submitBtn) {
                setTimeout(() => submitBtn.click(), 500);
                logs.push("최종 충전버튼 클릭완료");
            }
        } catch(err) {
            logs.push("JS실행에러: " + err.message);
        }
        return logs;
    });

    console.log(`브라우저 침투 결과: ${injectResult.join(', ')}`);
    
    // 서버가 처리할 시간 주기
    await page.waitForTimeout(5000); 

    // 화면에서 계좌번호 스크래핑
    let accountInfo = "추출 실패 (수동 확인 필요)";
    try {
      const bodyText = await page.innerText('body');
      const match = bodyText.match(/(?:케이뱅크|계좌번호|입금계좌).*?([0-9\-\s]{10,20})/);
      if (match && match[1]) {
        accountInfo = match[1].replace(/[^0-9]/g, ''); // 숫자만 깔끔하게 빼오기
      }
    } catch(e) {}

    return { success: true, account: accountInfo, logs: popupLogs };
  } catch (e) {
    console.error("충전 프로세스 에러:", e);
    return { success: false, account: "", logs: popupLogs };
  }
}

// ── 2. 데이터 관리 및 당첨 확인 관련 함수 ─────────────────────────────
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

// ── 3. 메인 엔진 ──────────────────────────────────────────────
export default async function(api) {
  const isScheduled = process.env.IS_SCHEDULED === 'true';
  const scheduleCommand = (process.env.INPUT_COMMAND || 'PURCHASE_AUTO').trim();
  const inputEnv = (process.env.INPUT_LOTTO_NUMBERS || '').replace(/['"]/g, '').trim();
  const accMode = (process.env.INPUT_ACCOUNT_MODE || 'acc1').trim();
  const displayAccName = accMode === 'acc2' ? '계정 2' : '계정 1'; 

  let results = { balance1: "--", balance2: "--", history: [], ledger: [], reservation: null, last_run: "" };
  try { if (fs.existsSync('result.json')) results = Object.assign(results, JSON.parse(fs.readFileSync('result.json', 'utf8'))); } catch(e) {}

  const page = api.page || (api.session ? api.session.page : null);
  if (!page) return { status: "fail", message: "브라우저 연결 실패" };

  // ── [A] 특수 모드: RECHARGE_TEST (충전 전용 테스트) ──
  if (inputEnv === "RECHARGE_TEST") {
    const orderRes = await autoRechargeOrder(page, displayAccName);
    const logStr = orderRes.logs.length > 0 ? orderRes.logs.join(" ➡️ ") : "기록된 팝업 없음(정상)";
    if (orderRes.success) {
      await sendTelegram(`⚡ [${displayAccName} 충전 테스트 성공]\n- 입금계좌: 케이뱅크 ${orderRes.account}\n- 팝업로그: ${logStr}`);
    } else {
      await sendTelegram(`❌ [${displayAccName} 충전 테스트 실패]\n- 팝업로그: ${logStr}`);
    }
    return { status: "success" };
  }

  // ── [B] 앱 예약 설정/취소 ──
  if (inputEnv && inputEnv !== "SYNC_ONLY" && !inputEnv.includes("_")) {
    if (inputEnv.startsWith("RESERVE_SET|")) {
      const p = inputEnv.split("|");
      results.reservation = { isActive: true, targetMode: accMode, type: p[1], count: parseInt(p[2]), endDate: p[3], favs: p[4] ? p[4].split(";") : [] };
      fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
      await sendTelegram(`🗓️ [예약 성공] ${displayAccName} 정기 구매가 설정되었습니다.`);
      return { status: "success" };
    }
    if (inputEnv === "RESERVE_CANCEL") {
      results.reservation = null;
      fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
      await sendTelegram(`🗑️ [예약 취소] 정기 구매 스케줄이 취소되었습니다.`);
      return { status: "success" };
    }
  }

  // ── [C] 기본 정보 조회 ──
  let currentBalance = "0"; 
  try {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    const res = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle' });
    const json = JSON.parse(await res.text());
    currentBalance = String(json?.data?.userMndp?.crntEntrsAmt || "0");
  } catch (e) {}
  if (accMode === 'acc2') results.balance2 = currentBalance; else results.balance1 = currentBalance;

  // ── [D] 스케줄: 잔액 파수꾼 (월요일 저녁) ──
  if (isScheduled && scheduleCommand === 'CHECK_BALANCE') {
    if (parseInt(currentBalance) < 5000) {
      await sendTelegram(`🚨 [${displayAccName} 잔액 부족]\n현재 ${Number(currentBalance).toLocaleString()}원입니다.\n아침 자동이체가 정상 처리되었는지 확인하세요.`);
    }
    return { status: "success" };
  }

  // ── [E] 구매 로직 (정기/수동) ──
  let isBuy = false; let targetGames = "";
  if (inputEnv !== "SYNC_ONLY" && !(isScheduled && scheduleCommand === 'CHECK_WIN')) {
    isBuy = true;
    if (isScheduled && scheduleCommand === 'PURCHASE_AUTO') {
      const res = results.reservation;
      if (!res || !res.isActive) return { status: "success" };
      const today = toDateStr(new Date());
      if (today > res.endDate) {
        if (res.targetMode === 'both' || res.targetMode === accMode) {
          res.isActive = false; fs.writeFileSync('result.json', JSON.stringify(results, null, 2));
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
      targetGames = tGames.join("_");
    } else { targetGames = inputEnv; }
  }

  let finalStatus = "success"; let finalMessage = "작업 완료"; let purchasedGames = []; let orderNote = "";
  if (isBuy && targetGames) {
    if (parseInt(currentBalance) >= 1000) {
      try {
        let targetNumbersArray = targetGames.split(/[|_]/).map(group => group.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)));
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
          if (skippedCount > 0) finalMessage += ` (잔액 부족으로 ${skippedCount}게임 제외됨)`;
        } else if (validGames.length === 0) {
          throw new Error("유효한 번호가 없습니다.");
        }
      } catch (err) { 
        finalStatus = "fail"; finalMessage = "구매 에러 (주간 한도초과 등)"; 
      }
    } else { 
      finalStatus = "fail"; finalMessage = "잔액 부족 (최소 1,000원 필요)"; 
    }

    // 💡 월요일 자동구매 성공 시 충전 자동 예약 연계
    if (isScheduled && scheduleCommand === 'PURCHASE_AUTO' && finalStatus === "success") {
      const orderRes = await autoRechargeOrder(page, displayAccName);
      if (orderRes.success) orderNote = `\n- [충전예약완료] 케이뱅크 ${orderRes.account}`;
    }

    try {
      const reRes = await page.goto('https://www.dhlottery.co.kr/mypage/selectUserMndp.do', { waitUntil: 'networkidle' });
      const reJson = JSON.parse(await reRes.text());
      currentBalance = String(reJson?.data?.userMndp?.crntEntrsAmt || "0");
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

  // ── [G] 텔레그램 발송 ──
  if (isScheduled && scheduleCommand === 'CHECK_WIN') {
    const todayStr = toDateStr(new Date());
    const todayWins = ledgerData.filter(t => t.drawed && t.winTotalAmt > 0 && t.acc === displayAccName && (t.drawDate.replace(/-/g, '') === todayStr || t.drawDate === todayStr));

    if (todayWins.length > 0) {
      let winMsg = `🎊 [${displayAccName} 축 당첨!!] 🎊`;
      todayWins.forEach(t => { winMsg += `\n제 ${t.round}회: ${t.winTotalAmt.toLocaleString()}원 당첨!`; });
      await sendTelegram(winMsg);
    }
    return { status: "success", balance: currentBalance };
  }

  if (isBuy) {
    if (isScheduled) {
      await sendTelegram(`🗓️ [${displayAccName} 월요 구매]\n- 상태: ${finalMessage}${orderNote}\n- 잔액: ${Number(currentBalance).toLocaleString()}원\n- 오후 7시에 잔액을 최종 점검합니다.`);
    } else {
      await sendTelegram(`${finalStatus === "success" ? "🎉" : "⚠️"} [${displayAccName} 즉시 구매]\n- 상태: ${finalMessage}\n- 잔액: ${Number(currentBalance).toLocaleString()}원`);
    }
  } else if (inputEnv === "SYNC_ONLY") {
    await sendTelegram(`📡 [${displayAccName} 동기화 완료]\n- 현재 잔액: ${Number(currentBalance).toLocaleString()}원`);
  }

  return { status: finalStatus, balance: currentBalance };
}
