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
        console.log("=== 📱 [2차 수사 시작] 모바일 메인 화면 정밀 추적 ===");
        
        console.log("📡 진짜 모바일 메인 페이지로 접속 중...");
        await page.goto("https://m.dhlottery.co.kr/common.do?method=main", { waitUntil: "networkidle", timeout: 30000 });
        
        // 💡 화면 로딩을 위해 넉넉하게 5초 대기
        await page.waitForTimeout(5000); 

        // 🔍 [핵심] 로봇 시야 확인 (화면 전체 텍스트 로그 출력)
        const allText = await page.evaluate(() => document.body.innerText);
        console.log("------------------------------------------");
        console.log("👀 [모바일 메인 화면 텍스트 (앞부분 1000자)]");
        console.log(allText.substring(0, 1000));
        console.log("------------------------------------------");

        // 임시 추출 시도
        const match = allText.match(/예치금\s*[:\n]?\s*([0-9,]{1,10})\s*원/);
        if (match && match[1]) {
            currentBalance = match[1].replace(/[^0-9]/g, ''); 
        } else {
            // 이번엔 못 찾으면 '못찾음'이라고 명확히 표시
            currentBalance = "못찾음"; 
        }

        console.log(`✅ 추출 시도 결과: ${currentBalance} (못찾음이 뜨면 정규식 수정 필요)`);

    } catch (e) {
        console.log(`❌ 작업 중 에러 발생: ${e.message}`);
        status = "fail";
        message = `에러: ${e.message}`;
    }

    // 구매 불가 시간 방어 로직 (00~06시)
    const kstTimeFinal = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTimeFinal.getHours();

    if (hour >= 0 && hour < 6) {
        console.log("⚠️ 점검 시간대(00-06시)이므로 구매는 생략하고 잔액만 저장합니다.");
        message = "잔액 동기화 완료 (점검시간)";
    } else {
        console.log("🚀 구매 가능 시간입니다. 로또 구매 시도 중...");
        try {
            const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
            const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
            
            if (api.purchaseManual) {
                 await api.purchaseManual([targetNumbers]); 
                 console.log(`✅ 로또 구매 성공! 번호: [${targetNumbers.join(', ')}]`);
                 message = "로또 구매 성공!";
            }
        } catch (error) {
            console.log(`❌ 구매 에러: ${error.message}`);
            message = `구매 에러: ${error.message}`;
            status = "fail";
        }
    }

    // 결과 저장 (result.json)
    try {
        const resultData = { balance: currentBalance, status: status, message: message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {
        console.log(`❌ 파일 저장 실패: ${e.message}`);
    }

    return { status, message, balance: currentBalance };
}
