import fs from 'fs';

export default async (api) => {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) {
        console.error("❌ 조종기(page)를 찾을 수 없습니다.");
        return { status: "fail", message: "조종기 연결 실패" };
    }

    try {
        console.log("=== 📱 [수사 시작] 예치금 정밀 추적 가동 ===");
        
        // 1. 한국 시간 동기화
        const kstTime = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        console.log(`⏰ 현재 로봇이 인지하는 한국 시간: ${kstTime.toLocaleString('ko-KR')}`);

        // 2. 마이페이지 접속 및 대기
        console.log("📡 확실한 조회를 위해 마이페이지(PC버전 주소) 접속 중...");
        await page.goto("https://dhlottery.co.kr/user.do?method=myPage", { waitUntil: "networkidle", timeout: 30000 });
        
        // 💡 충분히 기다립니다 (5초)
        await page.waitForTimeout(5000); 

        // 3. 🔍 [핵심] 로봇 시야 확인 (화면 전체 텍스트 로그 출력)
        const allText = await page.evaluate(() => document.body.innerText);
        console.log("------------------------------------------");
        console.log("👀 [로봇이 보고 있는 화면 텍스트 (앞부분 800자)]");
        console.log(allText.substring(0, 800));
        console.log("------------------------------------------");

        // 4. 예치금 정밀 스크래핑 (단어 매칭 강화)
        currentBalance = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // "예치금" 단어 바로 뒤에 오는 숫자만 정규식으로 정밀 타겟팅
            // 예: "예치금 10,000원" 혹은 "예치금 : 10,000원"
            const match = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]{1,10})\s*원/);
            
            if (match && match[1]) {
                const num = match[1].replace(/[^0-9]/g, '');
                return num === "0" ? "0" : num; // 0이면 0, 아니면 숫자 반환
            }
            return "--";
        });

        console.log(`✅ 최종 추출된 예치금 숫자: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 작업 중 에러 발생: ${e.message}`);
        status = "fail";
        message = `에러: ${e.message}`;
    }

    // 5. 구매 방어 로직 (한국 시간 기준 00~06시)
    const kstTimeFinal = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTimeFinal.getHours();

    if (hour >= 0 && hour < 6) {
        console.log("⚠️ 점검 시간대(00-06시)이므로 구매는 생략하고 잔액만 저장합니다.");
        message = "점검 시간 (잔액 업데이트 완료)";
    } else {
        // 구매 로직 (생략 가능하지만 일단 유지)
        console.log("🚀 구매 가능 시간입니다. 시도 중...");
    }

    // 6. 어플 동기화용 결과 저장
    try {
        const resultData = {
            balance: currentBalance,
            status: status,
            message: message,
            last_run: new Date().toISOString()
        };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {
        console.log(`❌ 파일 저장 실패: ${e.message}`);
    }

    return { status, message, balance: currentBalance };
};
