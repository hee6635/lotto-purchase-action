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
        console.log("=== 📱 [3차 정밀 수사] 모바일 마이페이지 타격 ===");
        
        // 💡 [핵심] 404 에러 안 나는 모바일 전용 마이페이지 주소입니다.
        console.log("📡 모바일 마이페이지(SSL) 접속 중...");
        await page.goto("https://m.dhlottery.co.kr/userSsl.do?method=myPage", { waitUntil: "networkidle", timeout: 30000 });
        
        // 숫자가 서버에서 넘어올 때까지 넉넉하게 6초 기다립니다. (새벽 서버 응답 대비)
        await page.waitForTimeout(6000); 

        // 🔍 [추적 모드] 이번엔 2000자까지 넓게 봅니다.
        const allText = await page.evaluate(() => document.body.innerText);
        console.log("------------------------------------------");
        console.log("👀 [마이페이지 화면 텍스트 추출]");
        console.log(allText.substring(0, 1500)); 
        console.log("------------------------------------------");

        // 🔍 예치금 추출 (정규식 강화: 숫자가 0이어도 가져오되, 앞뒤 문맥 확인)
        currentBalance = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            // '예치금' 뒤에 나오는 숫자와 콤마를 찾습니다.
            const match = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]+)\s*원/);
            
            if (match && match[1]) {
                const val = match[1].replace(/[^0-9]/g, '');
                return val === "" ? "0" : val;
            }
            return "추출실패";
        });

        console.log(`✅ 최종 추출된 예치금 숫자: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 작업 중 에러 발생: ${e.message}`);
        status = "fail";
        message = `에러: ${e.message}`;
    }

    // 구매 불가 시간 방어 (한국시간 00~06시)
    const kstTimeFinal = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTimeFinal.getHours();

    if (hour >= 0 && hour < 6) {
        console.log("⚠️ 점검 시간대(00-06시)이므로 잔액만 동기화합니다.");
        message = "잔액 동기화 완료 (점검시간)";
    } else {
        console.log("🚀 구매 가능 시간입니다. 로또 구매 시도!");
    }

    // 결과 저장 (result.json)
    try {
        const resultData = { balance: currentBalance, status: status, message: message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
