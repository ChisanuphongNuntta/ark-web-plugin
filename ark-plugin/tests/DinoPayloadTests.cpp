#include "DinoPayload.h"

#include <cassert>
#include <string>
#include <vector>

int main()
{
    using HeartShop::DinoPayload::DecodeBase64;
    using HeartShop::DinoPayload::EncodeBase64;

    const std::string Source("\x00\x01\x02native-dino-state\xff", 21);
    const auto Encoded = EncodeBase64(
        reinterpret_cast<const unsigned char*>(Source.data()), Source.size());
    std::vector<unsigned char> Decoded;
    assert(DecodeBase64(Encoded, Decoded));
    assert(std::string(Decoded.begin(), Decoded.end()) == Source);

    assert(!DecodeBase64("", Decoded));
    assert(!DecodeBase64("abc", Decoded));
    assert(!DecodeBase64("ab=c", Decoded));
    assert(!DecodeBase64("!!!!", Decoded));
    assert(!DecodeBase64(Encoded, Decoded, 4));

    const unsigned char One[] = {'M'};
    assert(EncodeBase64(One, 1) == "TQ==");
    assert(DecodeBase64("TQ==", Decoded));
    assert(Decoded.size() == 1 && Decoded[0] == 'M');
    return 0;
}
