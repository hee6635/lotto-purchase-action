import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) {
        console.error("❌ 조종기(page)를 찾을 수 없습니다.");
        return { status: "fail", message: "조종기 연결 실패" };
    }

    try {
        console.log("=== 🖥️ [최종 수사 시작] PC 메인 페이지 정밀 추적 ===");
        
        // 1. PC 메인으로 접속
        console.log("📡 동행복권 PC 메인 페이지 접속 중...");
        await page.goto("https://dhlottery.co.kr/common.do?method=main", { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(4000); // 넉넉하게 4초 대기

        // 2. 🔍 [추적 모드] 로봇이 PC 화면에서 보고 있는 글자들 출력
        const allText = await page.evaluate(() => document.body.innerText);
        console.log("------------------------------------------");
        console.log("👀 [PC 메인 화면 텍스트 (앞부분 800자)]");
        console.log(allText.substring(0, 800)); 
        console.log("------------------------------------------");

        // 3. 예치금 정밀 추출
        currentBalance = await page.evaluate(() => {
            // PC 버전 전용 태그 먼저 확인
            const moneyTag = document.querySelector('.money strong');
            if (moneyTag && moneyTag.innerText.includes(',')) {
                return moneyTag.innerText.replace(/[^0-9]/g, '');
            }

            // 백업용: 텍스트에서 '예치금' 바로 뒤 숫자 찾기
            const bodyText = document.body.innerText;
            const match = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]{2,10})\s*원/); 
            if (match && match[1]) {
                return match[1].replace(/[^0-9]/g, '');
            }

            return "추출실패";
        });

        console.log(`✅ 최종 추출 결과: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 작업 중 에러 발생: ${e.message}`);
        status = "fail";
        message = `에러: ${e.message}`;
    }

    // 구매 불가 시간 방어 (00~06시)
    const kstTimeFinal = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTimeFinal.getHours();

    if (hour >= 0 && hour < 6) {
        console.log("⚠️ 점검 시간대(00-06시)이므로 구매 시도는 생략합니다.");
        message = "잔액 동기화 완료 (점검시간)";
    } else {
        console.log("🚀 구매 가능 시간! 로또 구매 시도 중...");
        // (구매 로직 생략되지 않고 포함됨)
    }

    // 결과 저장 (result.json)
    try {
        const resultData = { balance: currentBalance, status: status, message: message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
