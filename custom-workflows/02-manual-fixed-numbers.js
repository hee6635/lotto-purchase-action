import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    // 🔍 수사 대상 (PC/모바일, 구매/내역/정보 등 12개 구역)
    const targetUrls = [
        { n: "PC 메인", u: "https://dhlottery.co.kr/common.do?method=main" },
        { n: "모바일 메인", u: "https://m.dhlottery.co.kr/common.do?method=main" },
        { n: "모바일 마이페이지", u: "https://m.dhlottery.co.kr/userSsl.do?method=myPage" },
        { n: "예치금 내역(M)", u: "https://m.dhlottery.co.kr/myPage.do?method=depositList" },
        { n: "구매내역(M)", u: "https://m.dhlottery.co.kr/myPage.do?method=lottoBuyList" },
        { n: "로또 구매창(PC)", u: "https://ol.dhlottery.co.kr/olotto/game/game645.do" },
        { n: "연금복권(M)", u: "https://m.dhlottery.co.kr/game/pension720/buy" },
        { n: "내 정보 수정(M)", u: "https://m.dhlottery.co.kr/userSsl.do?method=memberUpdateConfirm" },
        { n: "충전하기(M)", u: "https://m.dhlottery.co.kr/payment.do?method=payment" },
        { n: "출금하기(M)", u: "https://m.dhlottery.co.kr/userSsl.do?method=cashWithdrawalRequest" },
        { n: "고객센터(M)", u: "https://m.dhlottery.co.kr/customer.do?method=noticeList" },
        { n: "잔액API(Direct)", u: "https://dhlottery.co.kr/user.do?method=cashBalanceApi" }
    ];

    let scanResults = [];
    let foundBalance = "0";

    console.log("=== 🕵️‍♂️ [대규모 전수 조사] 12개 구역 스캔 가동 ===");

    for (const target of targetUrls) {
        try {
            console.log(`📡 [수사 중] ${target.n} 진입...`);
            await page.goto(target.u, { waitUntil: "domcontentloaded", timeout: 15000 });
            await page.waitForTimeout(2500); // 렌더링 대기

            const report = await page.evaluate((name) => {
                const text = document.body.innerText;
                const hasKeyword = text.includes("예치금");
                const hasAmount = text.includes("10,000") || text.includes("10,000원");
                
                let snippet = "내용 없음";
                if (hasKeyword || hasAmount) {
                    const idx = text.indexOf(hasKeyword ? "예치금" : "10,000");
                    snippet = text.substring(Math.max(0, idx - 20), idx + 60).replace(/\n/g, ' ');
                }

                return { name, hasKeyword, hasAmount, snippet };
            }, target.n);

            if (report.hasKeyword || report.hasAmount) {
                console.log(`✅ [발견!] ${target.n}: ${report.snippet}`);
                // 발견된 곳에서 숫자만 추출 시도
                const match = report.snippet.match(/([0-9,]{2,10})/);
                if (match) foundBalance = match[1].replace(/[^0-9]/g, '');
            } else {
                console.log(`❌ ${target.n}: 흔적 없음`);
            }
            
            scanResults.push(report);
        } catch (e) {
            console.log(`⚠️ ${target.n} 조사 건너뜀: ${e.message}`);
        }
    }

    console.log("=== 🕵️‍♂️ 수사 종료: 가장 신빙성 있는 잔액 확정 ===");
    console.log(`💰 최종 포착 잔액: ${foundBalance}원`);

    // 🚀 구매 시도 (조사 후에 6시 넘었으니 그대로 진행)
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        if (api.purchaseManual) {
            await api.purchaseManual([targetNumbers]);
        }
    } catch (err) {}

    // 결과 저장
    const resultData = { balance: foundBalance, last_run: new Date().toISOString(), scan_report: scanResults };
    fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));

    return { status: "success", balance: foundBalance };
}
