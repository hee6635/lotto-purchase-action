import fs from 'fs'; // 파일을 쓰기 위한 도구

export default async ({ purchaseManual }) => {
  console.log('=== 리모컨 어플 연동 수동 구매 시작 ===');

  const rawNumbers = process.env['INPUT_LOTTO-NUMBERS'];
  let targetNumbers = [];

  if (rawNumbers) {
    const parsedArray = rawNumbers.split(',').map(n => parseInt(n.trim(), 10));
    targetNumbers = [parsedArray];
  } else {
    targetNumbers = [[1, 2, 3, 4, 5, 6]];
  }

  try {
    const purchased = await purchaseManual(targetNumbers);
    console.log('✅ 수동 구매 완료:', JSON.stringify(purchased));

    // 💡 [핵심] 진짜 잔액 추출 및 파일 저장
    // purchased 결과에서 실제 잔액(balance)을 찾아냅니다.
    if (purchased && purchased.length > 0) {
      const realBalance = purchased[0].balance || 0; // 엔진에 따라 위치가 다를 수 있음
      const resultData = {
        balance: realBalance,
        last_updated: new Date().toLocaleString('ko-KR')
      };
      
      // result.json 파일로 저장 (어플이 읽어갈 파일)
      fs.writeFileSync('result.json', JSON.stringify(resultData));
      console.log(`💰 실제 예치금(${realBalance}원)을 기록했습니다.`);
    }
  } catch (error) {
    console.error('❌ 에러:', error.message);
  }
};
